package com.corvidlabs.algochat

import org.bouncycastle.crypto.modes.ChaCha20Poly1305
import org.bouncycastle.crypto.params.AEADParameters
import org.bouncycastle.crypto.params.KeyParameter
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.security.SecureRandom

/**
 * Public room administration (protocol 0x03) and the 0x06 action-5 key delivery.
 *
 * Legacy 0x06 actions 1–4 stay in [Group] and do not create an owner.
 * Pending join requests are derived. They are not written in the note.
 */
object GroupAdmin {
    const val NAME_MAX = 64
    const val ADMIN_MAX = 16
    const val MEMBER_MAX = 100
    const val DELIVER_PLAINTEXT_SIZE = 133
    const val DELIVER_ACTION = 5

    private const val PROTOCOL: Byte = 0x03
    private const val JOINING_INVITE = 1
    private const val JOINING_ASK = 2
    private const val OP_CREATE = 1
    private const val OP_SET_NAME = 2
    private const val OP_SET_POLICY = 3
    private const val OP_APPOINT_ADMIN = 4
    private const val OP_DISMISS_ADMIN = 5
    private const val OP_TRANSFER_OWNER = 6
    private const val OP_ADD_MEMBER = 7
    private const val OP_REQUEST_JOIN = 8
    private const val OP_ACCEPT_JOIN = 9
    private const val OP_DECLINE_JOIN = 10
    private const val OP_REMOVE_MEMBER = 11
    private const val OP_REKEY = 12

    private val secureRandom = SecureRandom()

    fun draftAdmin(
        state: RoomState?,
        op: Int,
        sender: ByteArray,
        subject: ByteArray? = null,
        name: ByteArray? = null,
        policy: Int? = null,
        groupId: ByteArray? = null,
        mailbox: ByteArray? = null
    ): ByteArray {
        val subjectBytes = subject?.copyOf() ?: ByteArray(32)
        val decoded = DecodedAdmin(
            parent = state?.headTxId?.copyOf() ?: ByteArray(32),
            groupId = groupId?.copyOf() ?: state?.groupId?.copyOf() ?: ByteArray(32),
            mailbox = mailbox?.copyOf() ?: state?.mailbox?.copyOf() ?: ByteArray(32),
            epoch = 0,
            op = op,
            name = name?.copyOf() ?: state?.name?.copyOf() ?: ByteArray(0),
            policy = policy ?: state?.policy ?: JOINING_INVITE,
            owner = state?.owner?.copyOf() ?: sender.copyOf(),
            admins = state?.admins?.map { it.copyOf() } ?: emptyList(),
            members = state?.members?.map { it.copyOf() } ?: emptyList(),
            subject = subjectBytes
        )
        val next = if (op == OP_CREATE) {
            RoomBody(
                groupId = decoded.groupId,
                mailbox = decoded.mailbox,
                owner = sender.copyOf(),
                admins = emptyList(),
                members = listOf(sender.copyOf()),
                pending = emptyList(),
                policy = decoded.policy,
                name = decoded.name,
                epoch = 1
            )
        } else {
            expectNext(
                state,
                DecodedAdmin(
                    parent = decoded.parent,
                    groupId = decoded.groupId,
                    mailbox = decoded.mailbox,
                    epoch = state?.epoch ?: 1,
                    op = decoded.op,
                    name = decoded.name,
                    policy = decoded.policy,
                    owner = state?.owner?.copyOf() ?: sender.copyOf(),
                    admins = decoded.admins,
                    members = decoded.members,
                    subject = decoded.subject
                ),
                sender
            )
        }
        return encodeAdminRecord(
            DecodedAdmin(
                parent = decoded.parent,
                groupId = next.groupId,
                mailbox = next.mailbox,
                epoch = next.epoch,
                op = op,
                name = next.name,
                policy = next.policy,
                owner = next.owner,
                admins = next.admins,
                members = next.members,
                subject = subjectBytes
            )
        )
    }

    fun reduceAdmin(events: List<AdminEvent>): ReduceAdminResult {
        val ordered = events.sortedWith { left, right -> compareEvents(left, right) }
        var state: RoomState? = null
        val accepted = mutableListOf<AcceptedAdmin>()
        val rejected = mutableListOf<RejectedAdmin>()
        val seen = HashSet<String>()
        // 32 zero bytes are create's parent, not an accepted administration id.
        val known = HashSet<String>()
        for (event in ordered) {
            val key = hexKey(event.txId)
            if (seen.contains(key)) {
                rejected.add(RejectedAdmin(event.txId.copyOf(), "replay"))
                continue
            }
            try {
                val next = applyAdmin(state, event, known)
                seen.add(key)
                if (next.advance) known.add(hexKey(event.txId))
                state = next.state
                accepted.add(next.accepted)
            } catch (error: Exception) {
                rejected.add(RejectedAdmin(event.txId.copyOf(), error.message ?: "rejected"))
            }
        }
        return ReduceAdminResult(state, accepted.toList(), rejected.toList())
    }

    fun senderMayPost(state: RoomState, sender: ByteArray, epoch: Int): Boolean {
        requireLength("sender", sender, 32)
        return epoch == state.epoch && contains(state.members, sender)
    }

    fun deliveryAuthorized(
        accepted: List<AcceptedAdmin>,
        adminTxId: ByteArray,
        sender: ByteArray,
        recipient: ByteArray,
        epoch: Int
    ): Boolean {
        val record = accepted.find { it.txId.contentEquals(adminTxId) } ?: return false
        if (!record.sender.contentEquals(sender) || record.epoch != epoch) return false
        if (!contains(record.members, recipient)) return false
        return when (record.op) {
            OP_ADD_MEMBER, OP_ACCEPT_JOIN -> record.subject.contentEquals(recipient)
            OP_REMOVE_MEMBER -> !record.subject.contentEquals(recipient)
            OP_REKEY, OP_TRANSFER_OWNER -> true
            else -> false
        }
    }

    fun sealGroupKeyDelivery(
        session: PQSession,
        epoch: Int,
        groupId: ByteArray,
        mailbox: ByteArray,
        groupKey: ByteArray,
        adminTxId: ByteArray,
        nonce: ByteArray? = null
    ): ByteArray {
        requireLength("session key", session.sessionKey, 32)
        requireLength("sender public key", session.senderPublicKey, 32)
        requireLength("handshake id", session.handshakeId, 32)
        val chosen = nonce ?: randomBytes(Protocol.NONCE_SIZE)
        requireLength("nonce", chosen, Protocol.NONCE_SIZE)
        val plaintext = encodeDelivery(epoch, groupId, mailbox, groupKey, adminTxId)
        val header = ByteArray(PQProtocol.DATA_HEADER_SIZE)
        header[0] = PQProtocol.VERSION
        header[1] = GroupProtocol.MEMBERSHIP_ID
        session.senderPublicKey.copyInto(header, 2)
        session.handshakeId.copyInto(header, 34)
        chosen.copyInto(header, 66)
        val sealed = aeadEncrypt(session.sessionKey, chosen, plaintext, header)
        return header + sealed
    }

    fun openGroupKeyDelivery(note: ByteArray, session: PQSession): OpenedGroupKeyDelivery {
        val expected = PQProtocol.DATA_HEADER_SIZE + DELIVER_PLAINTEXT_SIZE + Protocol.TAG_SIZE
        if (note.size != expected || note[0] != PQProtocol.VERSION || note[1] != GroupProtocol.MEMBERSHIP_ID) {
            throw RoomAdminException("Not a group key delivery")
        }
        val sender = note.copyOfRange(2, 34)
        val handshakeId = note.copyOfRange(34, 66)
        val nonce = note.copyOfRange(66, 78)
        if (!sender.contentEquals(session.senderPublicKey)) {
            throw RoomAdminException("Key delivery sender does not match the session")
        }
        if (!handshakeId.contentEquals(session.handshakeId)) {
            throw RoomAdminException("Key delivery is for a different handshake")
        }
        val header = note.copyOfRange(0, PQProtocol.DATA_HEADER_SIZE)
        val plain = try {
            aeadDecrypt(session.sessionKey, nonce, note.copyOfRange(PQProtocol.DATA_HEADER_SIZE, note.size), header)
        } catch (error: Exception) {
            throw RoomAdminException("Group key delivery authentication failed")
        }
        if (plain.size != DELIVER_PLAINTEXT_SIZE || (plain[0].toInt() and 0xff) != DELIVER_ACTION) {
            throw RoomAdminException("Group key delivery plaintext is not action 5")
        }
        val epoch = readU32(plain, 1)
        if (epoch == 0) {
            throw RoomAdminException("Group epoch must be from 1 through 4294967295")
        }
        return OpenedGroupKeyDelivery(
            epoch,
            plain.copyOfRange(5, 37),
            plain.copyOfRange(37, 69),
            plain.copyOfRange(69, 101),
            plain.copyOfRange(101, 133)
        )
    }

    private fun encodeAdminRecord(fields: DecodedAdmin): ByteArray {
        val name = canonicalName(fields.name)
        val admins = canonicalSet(fields.admins, "admins", ADMIN_MAX)
        val members = canonicalSet(fields.members, "members", MEMBER_MAX)
        requireLength("parent", fields.parent, 32)
        requireLength("group id", fields.groupId, 32)
        requireLength("mailbox", fields.mailbox, 32)
        requireLength("owner", fields.owner, 32)
        requireLength("subject", fields.subject, 32)
        requireUint32("epoch", fields.epoch)
        if (fields.policy != JOINING_INVITE && fields.policy != JOINING_ASK) {
            throw RoomAdminException("Joining rule must be invite-only or ask-to-join")
        }
        if (fields.op !in OP_CREATE..OP_REKEY) {
            throw RoomAdminException("Unknown room administration operation")
        }
        val out = ByteArrayOutputStream()
        out.write(PQProtocol.VERSION.toInt())
        out.write(PROTOCOL.toInt())
        out.write(fields.parent)
        out.write(fields.groupId)
        out.write(fields.mailbox)
        writeU32(out, fields.epoch)
        out.write(fields.op)
        out.write(name.size)
        out.write(name)
        out.write(fields.policy)
        out.write(fields.owner)
        writeU16(out, admins.size)
        for (admin in admins) out.write(admin)
        writeU16(out, members.size)
        for (member in members) out.write(member)
        out.write(fields.subject)
        val note = out.toByteArray()
        if (note.size > Protocol.MAX_NOTE_SIZE) {
            throw RoomAdminException("Administration record exceeds 4096 bytes")
        }
        return note
    }

    private fun applyAdmin(
        state: RoomState?,
        event: AdminEvent,
        known: Set<String>
    ): AppliedAdmin {
        requireLength("sender", event.sender, 32)
        requireLength("transaction id", event.txId, 32)
        val decoded = decodeAdmin(event.note)
        if (decoded.mailbox.contentEquals(event.sender)) {
            throw RoomAdminException("Mailbox key does not own the room")
        }
        val parent = state?.headTxId ?: ByteArray(32)
        val request = decoded.op == OP_REQUEST_JOIN
        if (request) {
            if (state == null || isZero(decoded.parent) || !known.contains(hexKey(decoded.parent))) {
                throw RoomAdminException("Join request does not cite this room")
            }
        } else if (!decoded.parent.contentEquals(parent)) {
            throw RoomAdminException("Stale administration parent")
        }
        val next = expectNext(state, decoded, event.sender)
        if (!sameState(decoded, next)) {
            throw RoomAdminException("Administration record does not match the authorized next state")
        }
        val room = RoomState(
            next.groupId,
            next.mailbox,
            next.owner,
            next.admins,
            next.members,
            next.pending,
            next.policy,
            next.name,
            next.epoch,
            if (request) state!!.headTxId else event.txId
        )
        return AppliedAdmin(
            advance = !request,
            state = room,
            accepted = AcceptedAdmin(
                event.txId.copyOf(),
                event.sender.copyOf(),
                decoded.op,
                room.epoch,
                decoded.subject.copyOf(),
                room.members.map { it.copyOf() }
            )
        )
    }

    private fun expectNext(state: RoomState?, decoded: DecodedAdmin, sender: ByteArray): RoomBody {
        if (decoded.op == OP_CREATE) {
            if (state != null) throw RoomAdminException("Create requires an empty parent")
            if (!isZero(decoded.parent) || !isZero(decoded.subject)) {
                throw RoomAdminException("Create parent and subject must be zero")
            }
            if (!decoded.owner.contentEquals(sender)) throw RoomAdminException("Create sender is not the owner")
            if (decoded.epoch != 1 || decoded.admins.isNotEmpty()) {
                throw RoomAdminException("Create starts at epoch 1 with no admins")
            }
            if (decoded.members.size != 1 || !decoded.members[0].contentEquals(sender)) {
                throw RoomAdminException("Create membership is the owner alone")
            }
            rejectMailboxOverlap(decoded.mailbox, decoded.members, decoded.admins, decoded.owner)
            return body(decoded, emptyList())
        }
        if (state == null) throw RoomAdminException("Administration parent is missing")
        if (!decoded.groupId.contentEquals(state.groupId) || !decoded.mailbox.contentEquals(state.mailbox)) {
            throw RoomAdminException("Administration record is for a different room")
        }
        val privileged = sender.contentEquals(state.owner) || contains(state.admins, sender)
        var members = state.members.map { it.copyOf() }
        var admins = state.admins.map { it.copyOf() }
        var pending = state.pending.map { it.copyOf() }
        var owner = state.owner.copyOf()
        var epoch = state.epoch
        var name = state.name.copyOf()
        var policy = state.policy
        val subject = decoded.subject
        if (decoded.op == OP_SET_NAME) {
            if (!privileged || !isZero(subject)) throw RoomAdminException("Sender cannot rename the room")
            name = decoded.name.copyOf()
        } else if (decoded.op == OP_SET_POLICY) {
            if (!privileged || !isZero(subject)) throw RoomAdminException("Sender cannot change the joining rule")
            policy = decoded.policy
        } else if (decoded.op == OP_APPOINT_ADMIN) {
            if (!sender.contentEquals(state.owner)) throw RoomAdminException("Only the owner appoints an admin")
            if (!contains(members, subject) || subject.contentEquals(owner) || contains(admins, subject)) {
                throw RoomAdminException("That person cannot be appointed")
            }
            admins = canonicalSet(admins + listOf(subject), "admins", ADMIN_MAX)
        } else if (decoded.op == OP_DISMISS_ADMIN) {
            if (!sender.contentEquals(state.owner) || !contains(admins, subject)) {
                throw RoomAdminException("Only the owner dismisses an admin")
            }
            admins = admins.filter { !it.contentEquals(subject) }
        } else if (decoded.op == OP_TRANSFER_OWNER) {
            if (!sender.contentEquals(state.owner) || !contains(members, subject) || subject.contentEquals(owner)) {
                throw RoomAdminException("Ownership can move only from the owner to another member")
            }
            owner = subject.copyOf()
            admins = admins.filter { !it.contentEquals(subject) }
            epoch = bump(epoch)
        } else if (decoded.op == OP_ADD_MEMBER) {
            if (!privileged || contains(members, subject) || subject.contentEquals(state.mailbox)) {
                throw RoomAdminException("Sender cannot add that member")
            }
            members = canonicalSet(members + listOf(subject), "members", MEMBER_MAX)
            pending = pending.filter { !it.contentEquals(subject) }
        } else if (decoded.op == OP_REQUEST_JOIN) {
            if (state.policy != JOINING_ASK || !sender.contentEquals(subject) || contains(members, subject) || contains(pending, subject)) {
                throw RoomAdminException("That join request is not allowed")
            }
            pending = canonicalSet(pending + listOf(subject), "pending", MEMBER_MAX)
        } else if (decoded.op == OP_ACCEPT_JOIN) {
            if (!privileged || !contains(pending, subject)) throw RoomAdminException("No join request to accept")
            members = canonicalSet(members + listOf(subject), "members", MEMBER_MAX)
            pending = pending.filter { !it.contentEquals(subject) }
        } else if (decoded.op == OP_DECLINE_JOIN) {
            if (!privileged || !contains(pending, subject)) throw RoomAdminException("No join request to decline")
            pending = pending.filter { !it.contentEquals(subject) }
        } else if (decoded.op == OP_REMOVE_MEMBER) {
            if (!privileged || !contains(members, subject) || subject.contentEquals(owner)) {
                throw RoomAdminException("Sender cannot remove that member")
            }
            members = members.filter { !it.contentEquals(subject) }
            admins = admins.filter { !it.contentEquals(subject) }
            pending = pending.filter { !it.contentEquals(subject) }
            epoch = bump(epoch)
        } else if (decoded.op == OP_REKEY) {
            if (!privileged || !isZero(subject)) throw RoomAdminException("Sender cannot rotate the room key")
            epoch = bump(epoch)
        } else {
            throw RoomAdminException("Unknown room administration operation")
        }
        rejectMailboxOverlap(state.mailbox, members, admins, owner)
        if (!contains(members, owner)) throw RoomAdminException("The owner must remain a member")
        return RoomBody(
            state.groupId.copyOf(),
            state.mailbox.copyOf(),
            owner,
            admins,
            members,
            pending,
            policy,
            name,
            epoch
        )
    }

    private fun body(decoded: DecodedAdmin, pending: List<ByteArray>): RoomBody {
        return RoomBody(
            decoded.groupId.copyOf(),
            decoded.mailbox.copyOf(),
            decoded.owner.copyOf(),
            decoded.admins.map { it.copyOf() },
            decoded.members.map { it.copyOf() },
            pending.map { it.copyOf() },
            decoded.policy,
            decoded.name.copyOf(),
            decoded.epoch
        )
    }

    private fun sameState(decoded: DecodedAdmin, next: RoomBody): Boolean {
        return decoded.owner.contentEquals(next.owner) &&
            decoded.epoch == next.epoch &&
            decoded.policy == next.policy &&
            decoded.name.contentEquals(next.name) &&
            sameSet(decoded.admins, next.admins) &&
            sameSet(decoded.members, next.members)
    }

    private fun decodeAdmin(note: ByteArray): DecodedAdmin {
        if (note.size < 141 || note[0] != PQProtocol.VERSION || note[1] != PROTOCOL) {
            throw RoomAdminException("Not a room administration record")
        }
        var cursor = 2
        val parent = take(note, cursor, 32)
        cursor += 32
        val groupId = take(note, cursor, 32)
        cursor += 32
        val mailbox = take(note, cursor, 32)
        cursor += 32
        val epoch = readU32(note, cursor)
        cursor += 4
        val op = note[cursor].toInt() and 0xff
        cursor += 1
        val nameLen = note[cursor].toInt() and 0xff
        cursor += 1
        if (nameLen > NAME_MAX) throw RoomAdminException("Room name is longer than 64 bytes")
        val name = take(note, cursor, nameLen)
        cursor += nameLen
        canonicalName(name)
        val policy = note[cursor].toInt() and 0xff
        cursor += 1
        val owner = take(note, cursor, 32)
        cursor += 32
        val adminCount = readU16(note, cursor)
        cursor += 2
        val admins = ArrayList<ByteArray>(adminCount)
        for (index in 0 until adminCount) {
            admins.add(take(note, cursor, 32))
            cursor += 32
        }
        val memberCount = readU16(note, cursor)
        cursor += 2
        val members = ArrayList<ByteArray>(memberCount)
        for (index in 0 until memberCount) {
            members.add(take(note, cursor, 32))
            cursor += 32
        }
        val subject = take(note, cursor, 32)
        cursor += 32
        if (cursor != note.size) throw RoomAdminException("Administration record has trailing bytes")
        canonicalSet(admins, "admins", ADMIN_MAX)
        canonicalSet(members, "members", MEMBER_MAX)
        if (!strictlyIncreasing(admins) || !strictlyIncreasing(members)) {
            throw RoomAdminException("Administration sets must be strictly sorted")
        }
        if (policy != JOINING_INVITE && policy != JOINING_ASK) {
            throw RoomAdminException("Joining rule must be invite-only or ask-to-join")
        }
        return DecodedAdmin(parent, groupId, mailbox, epoch, op, name, policy, owner, admins, members, subject)
    }

    private fun encodeDelivery(
        epoch: Int,
        groupId: ByteArray,
        mailbox: ByteArray,
        groupKey: ByteArray,
        adminTxId: ByteArray
    ): ByteArray {
        requireUint32("epoch", epoch)
        if (uint32(epoch) < 1L) throw RoomAdminException("Group epoch must be from 1 through 4294967295")
        requireLength("group id", groupId, 32)
        requireLength("mailbox", mailbox, 32)
        requireLength("group key", groupKey, 32)
        requireLength("administration id", adminTxId, 32)
        val out = ByteArray(DELIVER_PLAINTEXT_SIZE)
        out[0] = DELIVER_ACTION.toByte()
        writeU32(out, 1, epoch)
        groupId.copyInto(out, 5)
        mailbox.copyInto(out, 37)
        groupKey.copyInto(out, 69)
        adminTxId.copyInto(out, 101)
        return out
    }

    private fun rejectMailboxOverlap(
        mailbox: ByteArray,
        members: List<ByteArray>,
        admins: List<ByteArray>,
        owner: ByteArray
    ) {
        if (mailbox.contentEquals(owner) || contains(members, mailbox) || contains(admins, mailbox)) {
            throw RoomAdminException("Mailbox key does not own the room")
        }
    }

    private fun canonicalName(name: ByteArray): ByteArray {
        if (name.size > NAME_MAX) throw RoomAdminException("Room name is longer than 64 bytes")
        try {
            Charsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(name))
        } catch (error: CharacterCodingException) {
            throw RoomAdminException("Room name is not UTF-8")
        }
        return name
    }

    private fun canonicalSet(values: List<ByteArray>, label: String, max: Int): List<ByteArray> {
        val sorted = values.map { it.copyOf() }.sortedWith { left, right -> compareBytes(left, right) }
        for (index in 1 until sorted.size) {
            if (sorted[index].contentEquals(sorted[index - 1])) throw RoomAdminException("Duplicate $label")
        }
        if (sorted.size > max) throw RoomAdminException("Too many $label")
        for (value in sorted) requireLength(label, value, 32)
        return sorted
    }

    private fun strictlyIncreasing(values: List<ByteArray>): Boolean {
        for (index in 1 until values.size) {
            if (compareBytes(values[index - 1], values[index]) >= 0) return false
        }
        return true
    }

    private fun contains(values: List<ByteArray>, target: ByteArray): Boolean {
        return values.any { it.contentEquals(target) }
    }

    private fun sameSet(left: List<ByteArray>, right: List<ByteArray>): Boolean {
        if (left.size != right.size) return false
        for (index in left.indices) {
            if (!left[index].contentEquals(right[index])) return false
        }
        return true
    }

    private fun compareEvents(left: AdminEvent, right: AdminEvent): Int {
        val byRound = left.round.compareTo(right.round)
        if (byRound != 0) return byRound
        val byOffset = left.offset.compareTo(right.offset)
        if (byOffset != 0) return byOffset
        return compareBytes(left.txId, right.txId)
    }

    private fun compareBytes(left: ByteArray, right: ByteArray): Int {
        val length = minOf(left.size, right.size)
        for (index in 0 until length) {
            val difference = (left[index].toInt() and 0xff) - (right[index].toInt() and 0xff)
            if (difference != 0) return difference
        }
        return left.size - right.size
    }

    private fun bump(epoch: Int): Int {
        if (uint32(epoch) >= 0xffff_ffffL) throw RoomAdminException("Group epoch is exhausted")
        return (uint32(epoch) + 1L).toInt()
    }

    private fun isZero(value: ByteArray): Boolean {
        return value.all { it == 0.toByte() }
    }

    private fun hexKey(value: ByteArray): String {
        val alphabet = "0123456789abcdef"
        val out = CharArray(value.size * 2)
        for (index in value.indices) {
            val byte = value[index].toInt() and 0xff
            out[index * 2] = alphabet[byte ushr 4]
            out[index * 2 + 1] = alphabet[byte and 0x0f]
        }
        return String(out)
    }

    private fun writeU32(out: ByteArrayOutputStream, value: Int) {
        out.write(value ushr 24)
        out.write(value ushr 16)
        out.write(value ushr 8)
        out.write(value)
    }

    private fun writeU16(out: ByteArrayOutputStream, value: Int) {
        out.write(value ushr 8)
        out.write(value)
    }

    private fun writeU32(target: ByteArray, offset: Int, value: Int) {
        target[offset] = (value ushr 24).toByte()
        target[offset + 1] = (value ushr 16).toByte()
        target[offset + 2] = (value ushr 8).toByte()
        target[offset + 3] = value.toByte()
    }

    private fun readU32(source: ByteArray, offset: Int): Int {
        if (offset + 4 > source.size) throw RoomAdminException("Administration record is truncated")
        return ((source[offset].toInt() and 0xff) shl 24) or
            ((source[offset + 1].toInt() and 0xff) shl 16) or
            ((source[offset + 2].toInt() and 0xff) shl 8) or
            (source[offset + 3].toInt() and 0xff)
    }

    private fun readU16(source: ByteArray, offset: Int): Int {
        if (offset + 2 > source.size) throw RoomAdminException("Administration record is truncated")
        return ((source[offset].toInt() and 0xff) shl 8) or (source[offset + 1].toInt() and 0xff)
    }

    private fun take(source: ByteArray, offset: Int, length: Int): ByteArray {
        if (offset < 0 || length < 0 || offset + length > source.size) {
            throw RoomAdminException("Administration record is truncated")
        }
        return source.copyOfRange(offset, offset + length)
    }

    private fun requireUint32(name: String, value: Int) {
        if (value < 0) throw RoomAdminException("$name must be from 0 through 4294967295")
    }

    private fun uint32(value: Int): Long {
        return value.toLong() and 0xffff_ffffL
    }

    private fun requireLength(name: String, value: ByteArray, size: Int) {
        if (value.size != size) {
            throw RoomAdminException("$name must be $size bytes, got ${value.size}")
        }
    }

    private fun randomBytes(size: Int): ByteArray {
        val bytes = ByteArray(size)
        secureRandom.nextBytes(bytes)
        return bytes
    }

    private fun aeadEncrypt(key: ByteArray, nonce: ByteArray, plaintext: ByteArray, aad: ByteArray): ByteArray {
        val cipher = ChaCha20Poly1305()
        cipher.init(true, AEADParameters(KeyParameter(key), 128, nonce, aad))
        val output = ByteArray(cipher.getOutputSize(plaintext.size))
        val len = cipher.processBytes(plaintext, 0, plaintext.size, output, 0)
        cipher.doFinal(output, len)
        return output
    }

    private fun aeadDecrypt(key: ByteArray, nonce: ByteArray, ciphertext: ByteArray, aad: ByteArray): ByteArray {
        val cipher = ChaCha20Poly1305()
        cipher.init(false, AEADParameters(KeyParameter(key), 128, nonce, aad))
        val output = ByteArray(cipher.getOutputSize(ciphertext.size))
        var len = cipher.processBytes(ciphertext, 0, ciphertext.size, output, 0)
        len += cipher.doFinal(output, len)
        return output.copyOf(len)
    }
}

/** Room administration failure. The message is the protocol sentence. */
class RoomAdminException(message: String) : Exception(message)

/** Accepted public state of one room. Pending is derived and is not in the note. */
class RoomState(
    groupId: ByteArray,
    mailbox: ByteArray,
    owner: ByteArray,
    admins: List<ByteArray>,
    members: List<ByteArray>,
    pending: List<ByteArray>,
    val policy: Int,
    name: ByteArray,
    val epoch: Int,
    headTxId: ByteArray
) {
    val groupId: ByteArray = groupId.copyOf()
    val mailbox: ByteArray = mailbox.copyOf()
    val owner: ByteArray = owner.copyOf()
    val admins: List<ByteArray> = admins.map { it.copyOf() }
    val members: List<ByteArray> = members.map { it.copyOf() }
    val pending: List<ByteArray> = pending.map { it.copyOf() }
    val name: ByteArray = name.copyOf()
    val headTxId: ByteArray = headTxId.copyOf()
}

/** One confirmed administration note, in chain order once reduced. */
class AdminEvent(
    val note: ByteArray,
    val sender: ByteArray,
    val txId: ByteArray,
    val round: Int,
    val offset: Int
)

/** One administration note the reducer accepted. */
class AcceptedAdmin(
    txId: ByteArray,
    sender: ByteArray,
    val op: Int,
    val epoch: Int,
    subject: ByteArray,
    members: List<ByteArray>
) {
    val txId: ByteArray = txId.copyOf()
    val sender: ByteArray = sender.copyOf()
    val subject: ByteArray = subject.copyOf()
    val members: List<ByteArray> = members.map { it.copyOf() }
}

/** One administration note the reducer rejected. */
class RejectedAdmin(
    txId: ByteArray,
    val reason: String
) {
    val txId: ByteArray = txId.copyOf()
}

/** Reducer output. [state] is null until a create is accepted. */
class ReduceAdminResult(
    val state: RoomState?,
    val accepted: List<AcceptedAdmin>,
    val rejected: List<RejectedAdmin>
)

/** Plaintext opened from a 0x06 action-5 note. */
class OpenedGroupKeyDelivery(
    val epoch: Int,
    val groupId: ByteArray,
    val mailbox: ByteArray,
    val groupKey: ByteArray,
    val adminTxId: ByteArray
)

private class DecodedAdmin(
    val parent: ByteArray,
    val groupId: ByteArray,
    val mailbox: ByteArray,
    val epoch: Int,
    val op: Int,
    val name: ByteArray,
    val policy: Int,
    val owner: ByteArray,
    val admins: List<ByteArray>,
    val members: List<ByteArray>,
    val subject: ByteArray
)

private class RoomBody(
    val groupId: ByteArray,
    val mailbox: ByteArray,
    val owner: ByteArray,
    val admins: List<ByteArray>,
    val members: List<ByteArray>,
    val pending: List<ByteArray>,
    val policy: Int,
    val name: ByteArray,
    val epoch: Int
)

private class AppliedAdmin(
    val advance: Boolean,
    val state: RoomState,
    val accepted: AcceptedAdmin
)
