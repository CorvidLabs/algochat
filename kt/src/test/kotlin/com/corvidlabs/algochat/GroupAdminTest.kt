package com.corvidlabs.algochat

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.bouncycastle.crypto.modes.ChaCha20Poly1305
import org.bouncycastle.crypto.params.AEADParameters
import org.bouncycastle.crypto.params.KeyParameter
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.io.File
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Protocol 0x03 and 0x06 action 5.
 * vectors/group-admin-v1.json is the full-list record.
 * vectors/group-admin-delta-v1.json is the delta record.
 */
class GroupAdminTest {
    @Test
    fun `stored full-list drafts stay readable and new drafts omit the member list`() {
        for (element in root.arr("drafts")) {
            val draft = element.jsonObject
            val stored = unhex(draft.str("note"))
            assertEquals(PQProtocol.VERSION, stored[0], draft.str("name"))
            assertEquals(0x03.toByte(), stored[1], draft.str("name"))
            val nameLen = stored[103].toInt() and 0xff
            val adminCount = ((stored[137 + nameLen].toInt() and 0xff) shl 8) or (stored[138 + nameLen].toInt() and 0xff)
            val memberAt = 139 + nameLen + (32 * adminCount)
            val memberCount = ((stored[memberAt].toInt() and 0xff) shl 8) or (stored[memberAt + 1].toInt() and 0xff)
            assertTrue(memberCount != GroupAdmin.MEMBERS_OMITTED, draft.str("name"))
            assertTrue(memberCount <= 100, draft.str("name"))
            val note = GroupAdmin.draftAdmin(
                draft.stateOrNull("basis_state"),
                draft.int("op"),
                unhex(draft.str("sender")),
                unhex(draft.str("subject")),
                draft.utf8OrNull("name_utf8"),
                draft.intOrNull("policy"),
                draft.hexOrNull("group_id"),
                draft.hexOrNull("mailbox")
            )
            assertTrue(note.size <= 4096, draft.str("name"))
            val deltaName = note[103].toInt() and 0xff
            val deltaAdmins = ((note[137 + deltaName].toInt() and 0xff) shl 8) or (note[138 + deltaName].toInt() and 0xff)
            val deltaAt = 139 + deltaName + (32 * deltaAdmins)
            val sentinel = ((note[deltaAt].toInt() and 0xff) shl 8) or (note[deltaAt + 1].toInt() and 0xff)
            assertEquals(GroupAdmin.MEMBERS_OMITTED, sentinel, draft.str("name"))
        }
    }

    @Test
    fun `draft errors contain the vector sentence`() {
        for (element in root.arr("draft_errors")) {
            val item = element.jsonObject
            val error = assertThrows<RoomAdminException> {
                GroupAdmin.draftAdmin(
                    item.stateOrNull("basis_state"),
                    item.int("op"),
                    unhex(item.str("sender")),
                    unhex(item.str("subject")),
                    item.utf8OrNull("name_utf8"),
                    item.intOrNull("policy"),
                    item.hexOrNull("group_id"),
                    item.hexOrNull("mailbox")
                )
            }
            val expected = item.str("error_includes")
            assertTrue(
                error.message?.contains(expected, ignoreCase = true) == true,
                "${item.str("name")} message \"${error.message}\" does not contain \"$expected\""
            )
        }
    }

    @Test
    fun `reductions match rejected reasons accepted ops and state`() {
        for ((name, element) in root.obj("reductions")) {
            val reduction = element.jsonObject
            val result = reduce(reduction)
            val rejected = reduction.arr("rejected")
            assertEquals(
                rejected.map { it.jsonObject.str("reason") },
                result.rejected.map { it.reason },
                name
            )
            val accepted = reduction.arr("accepted")
            assertEquals(
                accepted.map { it.jsonObject.int("op") },
                result.accepted.map { it.op },
                name
            )
            assertState(name, reduction["state"], result.state)
        }
    }

    @Test
    fun `delivery authorization and posting follow the vector`() {
        val reduced = HashMap<String, ReduceAdminResult>()
        for ((name, element) in root.obj("reductions")) {
            reduced[name] = reduce(element.jsonObject)
        }
        for (element in root.obj("checks").arr("delivery_authorized")) {
            val check = element.jsonObject
            val result = reduced[check.str("reduction")] ?: error("missing ${check.str("reduction")}")
            assertEquals(
                check.bool("allowed"),
                GroupAdmin.deliveryAuthorized(
                    result.accepted,
                    unhex(check.str("admin_tx_id")),
                    unhex(check.str("sender")),
                    unhex(check.str("recipient")),
                    check.int("epoch")
                ),
                check.str("reduction")
            )
        }
        for (element in root.obj("checks").arr("may_post")) {
            val check = element.jsonObject
            val result = reduced[check.str("reduction")] ?: error("missing ${check.str("reduction")}")
            val state = result.state ?: error("no state for ${check.str("reduction")}")
            assertEquals(
                check.bool("allowed"),
                GroupAdmin.senderMayPost(state, unhex(check.str("sender")), check.int("epoch")),
                check.str("reduction")
            )
        }
    }

    @Test
    fun `action 5 delivery matches the vector and is not a legacy membership note`() {
        val delivery = root.obj("delivery")
        val session = PQSession(
            unhex(delivery.str("session_key")),
            unhex(delivery.str("sender_x25519")),
            ByteArray(32),
            unhex(delivery.str("handshake_id"))
        )
        val note = GroupAdmin.sealGroupKeyDelivery(
            session,
            delivery.int("epoch"),
            unhex(delivery.str("group_id")),
            unhex(delivery.str("mailbox")),
            unhex(delivery.str("group_key")),
            unhex(delivery.str("admin_tx_id")),
            unhex(delivery.str("nonce"))
        )
        assertEquals(227, note.size)
        assertEquals(195, GroupProtocol.MEMBERSHIP_NOTE_SIZE)
        assertEquals(false, Group.isGroupMembership(note))
        assertEquals(delivery.str("note"), hex(note))
        val opened = GroupAdmin.openGroupKeyDelivery(note, session)
        assertEquals(delivery.str("group_key"), hex(opened.groupKey))
        assertEquals(delivery.int("epoch"), opened.epoch)
        assertEquals(delivery.str("group_id"), hex(opened.groupId))
        assertEquals(delivery.str("mailbox"), hex(opened.mailbox))
        assertEquals(delivery.str("admin_tx_id"), hex(opened.adminTxId))
    }

    @Test
    fun `action 5 binds version session and a positive epoch`() {
        val session = PQSession(ByteArray(32) { 0x42 }, ByteArray(32) { 0x11 }, ByteArray(32), ByteArray(32) { 0x43 })
        val nonce = ByteArray(12) { 0x55 }
        val groupId = ByteArray(32) { 7 }
        val mailbox = ByteArray(32) { 9 }
        val note = GroupAdmin.sealGroupKeyDelivery(session, 1, groupId, mailbox, ByteArray(32) { 4 }, ByteArray(32) { 10 }, nonce)
        assertEquals(1, GroupAdmin.openGroupKeyDelivery(note, session).epoch)
        val senderError = assertThrows<RoomAdminException> {
            GroupAdmin.openGroupKeyDelivery(note, PQSession(session.sessionKey, ByteArray(32) { 0x22 }, ByteArray(32), session.handshakeId))
        }
        assertTrue(senderError.message?.contains("sender") == true, senderError.message)
        val handshakeError = assertThrows<RoomAdminException> {
            GroupAdmin.openGroupKeyDelivery(note, PQSession(session.sessionKey, session.senderPublicKey, ByteArray(32), ByteArray(32) { 0x44 }))
        }
        assertTrue(handshakeError.message?.contains("handshake") == true, handshakeError.message)
        val flipped = note.copyOf()
        flipped[flipped.size - 1] = (flipped[flipped.size - 1].toInt() xor 1).toByte()
        val tagError = assertThrows<RoomAdminException> { GroupAdmin.openGroupKeyDelivery(flipped, session) }
        assertTrue(tagError.message?.contains("authentication") == true, tagError.message)
        val plain = ByteArray(133)
        plain[0] = 5
        groupId.copyInto(plain, 5)
        mailbox.copyInto(plain, 37)
        ByteArray(32) { 4 }.copyInto(plain, 69)
        ByteArray(32) { 10 }.copyInto(plain, 101)
        for (version in listOf(0, 1, 3, 255)) {
            val error = assertThrows<RoomAdminException> {
                GroupAdmin.openGroupKeyDelivery(sealRaw(session, plain, version, nonce), session)
            }
            assertTrue(error.message?.contains("Not a group key delivery") == true, "version $version ${error.message}")
        }
        val epochError = assertThrows<RoomAdminException> {
            GroupAdmin.openGroupKeyDelivery(sealRaw(session, plain, PQProtocol.VERSION.toInt(), nonce), session)
        }
        assertTrue(epochError.message?.contains("epoch") == true, epochError.message)
    }

    @Test
    fun `undefined joining policies are rejected and leave the room unchanged`() {
        val owner = ByteArray(32) { 1 }
        val groupId = ByteArray(32) { 7 }
        val mailbox = ByteArray(32) { 9 }
        val create = GroupAdmin.draftAdmin(null, 1, owner, ByteArray(32), "team".toByteArray(), 1, groupId, mailbox)
        for (policy in listOf(0, 3, 255)) {
            val reduced = GroupAdmin.reduceAdmin(listOf(AdminEvent(withPolicy(create, policy), owner, ByteArray(32) { 10 }, 1, 0)))
            assertEquals(null, reduced.state)
            assertEquals(0, reduced.accepted.size)
            assertTrue(reduced.rejected[0].reason.contains("invite-only or ask-to-join"))
        }
        val created = GroupAdmin.reduceAdmin(listOf(AdminEvent(create, owner, ByteArray(32) { 10 }, 1, 0)))
        val state = created.state ?: error("create")
        val setPolicy = GroupAdmin.draftAdmin(state, 3, owner, policy = 2)
        for (policy in listOf(0, 3, 255)) {
            val reduced = GroupAdmin.reduceAdmin(listOf(
                AdminEvent(create, owner, ByteArray(32) { 10 }, 1, 0),
                AdminEvent(withPolicy(setPolicy, policy), owner, ByteArray(32) { 11 }, 1, 1)
            ))
            assertEquals(1, reduced.state?.policy)
            assertTrue(reduced.state?.headTxId.contentEquals(ByteArray(32) { 10 }) == true)
            assertEquals(1, reduced.rejected.size)
            assertTrue(reduced.rejected[0].reason.contains("invite-only or ask-to-join"))
        }
    }

    @Test
    fun `a join request must cite an accepted administration transaction`() {
        val owner = ByteArray(32) { 1 }
        val friend = ByteArray(32) { 2 }
        val groupId = ByteArray(32) { 7 }
        val mailbox = ByteArray(32) { 9 }
        val create = GroupAdmin.draftAdmin(null, 1, owner, ByteArray(32), "general".toByteArray(), 2, groupId, mailbox)
        val created = GroupAdmin.reduceAdmin(listOf(AdminEvent(create, owner, ByteArray(32) { 10 }, 1, 0)))
        val state = created.state ?: error("create")
        val real = GroupAdmin.draftAdmin(state, 8, friend, friend)
        val zero = real.copyOf()
        ByteArray(32).copyInto(zero, 2)
        val unknown = real.copyOf()
        ByteArray(32) { 0x99.toByte() }.copyInto(unknown, 2)
        val base = AdminEvent(create, owner, ByteArray(32) { 10 }, 1, 0)
        val zeroed = GroupAdmin.reduceAdmin(listOf(base, AdminEvent(zero, friend, ByteArray(32) { 11 }, 1, 1)))
        assertEquals(0, zeroed.state?.pending?.size)
        assertTrue(zeroed.state?.headTxId.contentEquals(ByteArray(32) { 10 }) == true)
        assertTrue(zeroed.rejected[0].reason.contains("cite"))
        val missed = GroupAdmin.reduceAdmin(listOf(base, AdminEvent(unknown, friend, ByteArray(32) { 11 }, 1, 1)))
        assertEquals(0, missed.state?.pending?.size)
        assertEquals(2, missed.state?.policy)
        assertTrue(missed.rejected[0].reason.contains("cite"))
        val accepted = GroupAdmin.reduceAdmin(listOf(base, AdminEvent(real, friend, ByteArray(32) { 11 }, 1, 1)))
        assertEquals(0, accepted.rejected.size)
        assertEquals(1, accepted.state?.pending?.size)
        assertTrue(accepted.state?.pending?.get(0)?.contentEquals(friend) == true)
        assertTrue(accepted.state?.headTxId.contentEquals(ByteArray(32) { 10 }) == true)
    }

    @Test
    fun `a full-list note of 256 members is too large, and a delta note folds through 256`() {
        val owner = ByteArray(32) { 1 }
        val friend = ByteArray(32) { 2 }
        val groupId = ByteArray(32) { 7 }
        val mailbox = ByteArray(32) { 9 }
        val roster = (1..256).map { person(it) }
        val admins = (0 until GroupAdmin.ADMIN_MAX).map { person(1000 + it) }
        assertEquals(256, GroupAdmin.MEMBER_MAX)
        assertEquals(64, GroupAdmin.NAME_MAX)
        assertEquals(16, GroupAdmin.ADMIN_MAX)
        val tooLarge = assertThrows<RoomAdminException> {
            GroupAdmin.encodeAdminRecord(
                ByteArray(32),
                groupId,
                mailbox,
                1,
                1,
                ByteArray(GroupAdmin.NAME_MAX),
                1,
                roster[0],
                admins,
                roster,
                ByteArray(32),
                membersOmitted = false
            )
        }
        assertTrue(tooLarge.message?.contains("too large") == true, tooLarge.message)

        val legacy = GroupAdmin.encodeAdminRecord(
            ByteArray(32),
            groupId,
            mailbox,
            1,
            1,
            "team".toByteArray(),
            1,
            owner,
            emptyList(),
            listOf(owner),
            ByteArray(32),
            membersOmitted = false
        )
        val legacyRoom = GroupAdmin.reduceAdmin(listOf(adminEvent(legacy, owner, 10)))
        assertEquals(0, legacyRoom.rejected.size)
        assertEquals(1, legacyRoom.state?.members?.size)
        val legacyAdd = GroupAdmin.draftAdmin(legacyRoom.state, 7, owner, friend)
        val legacyGrown = GroupAdmin.reduceAdmin(listOf(
            adminEvent(legacy, owner, 10),
            adminEvent(legacyAdd, owner, 11, round = 2)
        ))
        assertEquals(0, legacyGrown.rejected.size, legacyGrown.rejected.firstOrNull()?.reason)
        assertEquals(2, legacyGrown.state?.members?.size)

        val hallId = person(900)
        val hallMail = person(901)
        val hallOwner = person(1)
        val events = mutableListOf<AdminEvent>()
        val createdNote = GroupAdmin.draftAdmin(
            null,
            1,
            hallOwner,
            name = "hall".toByteArray(),
            policy = 1,
            groupId = hallId,
            mailbox = hallMail
        )
        events.add(marked(createdNote, hallOwner, 1))
        var reduced = GroupAdmin.reduceAdmin(events)
        assertEquals(0, reduced.rejected.size, reduced.rejected.firstOrNull()?.reason)
        assertEquals(1, reduced.state?.members?.size)
        for (count in 2..256) {
            val note = GroupAdmin.draftAdmin(reduced.state, 7, hallOwner, person(count))
            assertTrue(note.size <= 4096)
            val nameLen = note[103].toInt() and 0xff
            val adminCount = ((note[137 + nameLen].toInt() and 0xff) shl 8) or (note[138 + nameLen].toInt() and 0xff)
            val at = 139 + nameLen + (32 * adminCount)
            val sentinel = ((note[at].toInt() and 0xff) shl 8) or (note[at + 1].toInt() and 0xff)
            assertEquals(GroupAdmin.MEMBERS_OMITTED, sentinel)
            events.add(marked(note, hallOwner, count))
            reduced = GroupAdmin.reduceAdmin(events)
            assertEquals(0, reduced.rejected.size, reduced.rejected.firstOrNull()?.reason)
            if (count == 101) assertEquals(101, reduced.state?.members?.size)
        }
        assertEquals(256, reduced.state?.members?.size)
        assertEquals(1, reduced.state?.epoch)
    }

    @Test
    fun `a channel keeps its own roster, and a missed key payment can resume`() {
        val owner = ByteArray(32) { 1 }
        val parentId = person(700)
        val parentMail = person(701)
        val channelId = person(702)
        val channelMail = person(703)
        val alice = person(2)
        val bob = person(3)
        val cara = person(4)
        val extra = (0 until 16).map { person(20 + it) }
        val parentCreate = GroupAdmin.draftAdmin(
            null, 1, owner, name = "hall".toByteArray(), policy = 1, groupId = parentId, mailbox = parentMail
        )
        var parentEvents = mutableListOf(adminEvent(parentCreate, owner, 10))
        var parent = GroupAdmin.reduceAdmin(parentEvents)
        for ((index, member) in (listOf(alice, bob, cara) + extra).withIndex()) {
            val note = GroupAdmin.draftAdmin(parent.state, 7, owner, member)
            parentEvents.add(adminEvent(note, owner, 11 + index, round = index + 2))
            parent = GroupAdmin.reduceAdmin(parentEvents)
        }
        assertEquals(0, parent.rejected.size, parent.rejected.firstOrNull()?.reason)
        assertEquals(1 + 3 + extra.size, parent.state?.members?.size)

        val strangerChannel = assertThrows<RoomAdminException> {
            GroupAdmin.draftAdmin(
                null, 1, alice, name = "ops".toByteArray(), policy = 1,
                groupId = channelId, mailbox = channelMail, parentRoom = parent.state
            )
        }
        assertTrue(strangerChannel.message?.contains("group owner") == true, strangerChannel.message)

        val channelCreate = GroupAdmin.draftAdmin(
            null, 1, owner, name = "ops".toByteArray(), policy = 1,
            groupId = channelId, mailbox = channelMail, parentRoom = parent.state
        )
        var channelEvents = mutableListOf(adminEvent(channelCreate, owner, 80, round = 30))
        var channel = GroupAdmin.reduceAdmin(channelEvents, parentEvents)
        assertEquals(0, channel.rejected.size, channel.rejected.firstOrNull()?.reason)
        assertEquals(1, channel.state?.members?.size)
        assertTrue(channel.state?.parentGroupId.contentEquals(parentId) == true)
        assertTrue(channel.state?.groupId.contentEquals(channelId) == true)
        assertTrue(channel.state?.mailbox.contentEquals(channelMail) == true)
        assertTrue(channel.state?.groupId.contentEquals(parent.state?.groupId) == false)

        for ((index, member) in (listOf(alice, bob) + extra).withIndex()) {
            val note = GroupAdmin.draftAdmin(
                channel.state, 7, owner, member, parentRoom = parent.state
            )
            channelEvents.add(adminEvent(note, owner, 81 + index, round = 31 + index))
            channel = GroupAdmin.reduceAdmin(channelEvents, parentEvents)
        }
        assertEquals(0, channel.rejected.size, channel.rejected.firstOrNull()?.reason)
        assertTrue(channel.state?.members?.any { it.contentEquals(cara) } == false)
        assertTrue(channel.state?.members?.any { it.contentEquals(alice) } == true)
        val outsider = assertThrows<RoomAdminException> {
            GroupAdmin.draftAdmin(channel.state, 7, owner, person(500), parentRoom = parent.state)
        }
        assertTrue(outsider.message?.contains("parent room") == true, outsider.message)
        val kept = assertThrows<RoomAdminException> {
            GroupAdmin.draftAdmin(channel.state, 6, owner, bob, parentRoom = parent.state)
        }
        assertTrue(kept.message?.contains("group owner keeps") == true, kept.message)

        val parentRemove = GroupAdmin.draftAdmin(parent.state, 11, owner, alice)
        parentEvents = (parentEvents + adminEvent(parentRemove, owner, 60, round = 80)).toMutableList()
        parent = GroupAdmin.reduceAdmin(parentEvents)
        assertEquals(2, parent.state?.epoch)
        assertEquals(false, GroupAdmin.senderMayPost(parent.state ?: error("parent"), alice, 2))
        val stale = GroupAdmin.reduceAdmin(channelEvents, parentEvents)
        assertTrue(stale.state?.members?.any { it.contentEquals(alice) } == true)
        val departures = GroupAdmin.channelDepartures(stale.state ?: error("channel"), parent.state ?: error("parent"))
        assertEquals(listOf(alice[3].toInt() and 0xff), departures.map { it[3].toInt() and 0xff })

        val channelRemove = GroupAdmin.draftAdmin(
            stale.state, 11, owner, alice, parentRoom = parent.state
        )
        channelEvents = (channelEvents + adminEvent(channelRemove, owner, 120, round = 90)).toMutableList()
        channel = GroupAdmin.reduceAdmin(channelEvents, parentEvents)
        assertEquals(0, channel.rejected.size, channel.rejected.firstOrNull()?.reason)
        assertEquals(2, channel.state?.epoch)
        assertTrue(channel.state?.members?.any { it.contentEquals(alice) } == false)
        val removeTx = channel.accepted.last()
        assertEquals(false, GroupAdmin.deliveryAuthorized(channel.accepted, removeTx.txId, owner, alice, 2))
        assertEquals(false, GroupAdmin.deliveryAuthorized(channel.accepted, removeTx.txId, bob, bob, 2))
        val recipients = GroupAdmin.authorizedRecipients(channel.accepted, removeTx.txId, owner, 2)
        assertTrue(recipients.none { it.contentEquals(alice) })
        assertTrue(recipients.any { it.contentEquals(bob) })
        assertTrue(recipients.size > GroupAdmin.DELIVER_BATCH)
        val batch = GroupAdmin.nextDeliveryBatch(recipients)
        assertEquals(GroupAdmin.DELIVER_BATCH, batch.size)
        val missed = batch.last()
        val landed = batch.dropLast(1)
        val pending = GroupAdmin.pendingKeyDeliveries(recipients, landed)
        assertTrue(pending.any { it.contentEquals(missed) })
        assertTrue(GroupAdmin.nextDeliveryBatch(pending).first().contentEquals(missed))
        val resumed = landed + missed
        val after = GroupAdmin.pendingKeyDeliveries(recipients, resumed)
        assertTrue(after.none { it.contentEquals(missed) })
        assertEquals(recipients.size - resumed.size, after.size)
    }

    @Test
    fun `group-admin-delta-v1 vector matches the frozen delta bytes`() {
        val vector = deltaRoot
        val constants = vector.obj("constants")
        assertEquals(GroupAdmin.MEMBER_MAX, constants.int("member_max"))
        assertEquals(GroupAdmin.MEMBERS_OMITTED, constants.int("members_omitted"))
        assertEquals(GroupAdmin.DELIVER_BATCH, constants.int("deliver_batch"))
        for (element in vector.arr("drafts")) {
            val draft = element.jsonObject
            val note = GroupAdmin.draftAdmin(
                draft.stateOrNull("basis_state"),
                draft.int("op"),
                unhex(draft.str("sender")),
                unhex(draft.str("subject")),
                draft.utf8OrNull("name_utf8"),
                draft.intOrNull("policy"),
                draft.hexOrNull("group_id"),
                draft.hexOrNull("mailbox"),
                draft.stateOrNull("parent_room")
            )
            assertEquals(draft.str("note"), hex(note), draft.str("name"))
        }
        for ((name, element) in vector.obj("reductions")) {
            val reduction = element.jsonObject
            val result = reduce(reduction)
            assertEquals(
                reduction.arr("rejected").map { it.jsonObject.str("reason") },
                result.rejected.map { it.reason },
                name
            )
            assertEquals(
                reduction.arr("accepted").map { it.jsonObject.int("op") },
                result.accepted.map { it.op },
                name
            )
            assertState(name, reduction["state"], result.state)
        }
    }

    private fun reduce(reduction: JsonObject): ReduceAdminResult {
        val events = reduction.arr("events").map { element ->
            val item = element.jsonObject
            AdminEvent(
                unhex(item.str("note")),
                unhex(item.str("sender")),
                unhex(item.str("tx_id")),
                item.int("round"),
                item.int("offset")
            )
        }
        val parent = reduction["parent_events"]
        val parentEvents = if (parent == null || parent is JsonNull) {
            null
        } else {
            parent.jsonArray.map { element ->
                val item = element.jsonObject
                AdminEvent(
                    unhex(item.str("note")),
                    unhex(item.str("sender")),
                    unhex(item.str("tx_id")),
                    item.int("round"),
                    item.int("offset")
                )
            }
        }
        return GroupAdmin.reduceAdmin(events, parentEvents)
    }

    private fun assertState(name: String, element: kotlinx.serialization.json.JsonElement?, actual: RoomState?) {
        if (element == null || element is JsonNull) {
            assertEquals(null, actual, name)
            return
        }
        val expected = element.jsonObject
        val state = actual ?: error("$name state is null")
        assertEquals(expected.str("group_id"), hex(state.groupId), name)
        assertEquals(expected.str("mailbox"), hex(state.mailbox), name)
        assertEquals(expected.str("owner"), hex(state.owner), name)
        assertEquals(expected.hexList("admins"), state.admins.map { hex(it) }, name)
        assertEquals(expected.hexList("members"), state.members.map { hex(it) }, name)
        assertEquals(expected.hexList("pending"), state.pending.map { hex(it) }, name)
        assertEquals(expected.int("policy"), state.policy, name)
        assertEquals(expected.str("name_hex"), hex(state.name), name)
        assertEquals(expected.int("epoch"), state.epoch, name)
        assertEquals(expected.str("head_tx_id"), hex(state.headTxId), name)
        val parent = expected["parent_group_id"]
        if (parent != null && parent !is JsonNull) {
            assertEquals(parent.jsonPrimitive.content, hex(state.parentGroupId), name)
        }
    }

    companion object {
        private val json = Json { ignoreUnknownKeys = true }
        private val root = loadVector("group-admin-v1.json")
        private val deltaRoot = loadVector("group-admin-delta-v1.json")

        private fun loadVector(name: String): JsonObject {
            val dir = File(System.getProperty("user.dir"))
            val file = listOf(
                File(dir, "../vectors/$name"),
                File(dir, "vectors/$name")
            ).firstOrNull { it.isFile } ?: error("$name not found from $dir")
            return json.parseToJsonElement(file.readText()).jsonObject
        }

        private fun unhex(hex: String): ByteArray {
            return hex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        }

        private fun hex(bytes: ByteArray): String {
            return bytes.joinToString("") { "%02x".format(it.toInt() and 0xff) }
        }
    }
}

private fun withPolicy(note: ByteArray, policy: Int): ByteArray {
    val out = note.copyOf()
    val nameLen = out[103].toInt() and 0xff
    out[104 + nameLen] = policy.toByte()
    return out
}

private fun sealRaw(session: PQSession, plain: ByteArray, version: Int, nonce: ByteArray): ByteArray {
    val header = ByteArray(PQProtocol.DATA_HEADER_SIZE)
    header[0] = version.toByte()
    header[1] = GroupProtocol.MEMBERSHIP_ID
    session.senderPublicKey.copyInto(header, 2)
    session.handshakeId.copyInto(header, 34)
    nonce.copyInto(header, 66)
    val cipher = ChaCha20Poly1305()
    cipher.init(true, AEADParameters(KeyParameter(session.sessionKey), 128, nonce, header))
    val output = ByteArray(cipher.getOutputSize(plain.size))
    val written = cipher.processBytes(plain, 0, plain.size, output, 0)
    cipher.doFinal(output, written)
    return header + output
}

private fun JsonObject.str(name: String): String {
    return this[name]?.jsonPrimitive?.content ?: error("missing $name")
}

private fun JsonObject.int(name: String): Int {
    return this[name]?.jsonPrimitive?.int ?: error("missing $name")
}

private fun JsonObject.bool(name: String): Boolean {
    return this[name]?.jsonPrimitive?.boolean ?: error("missing $name")
}

private fun JsonObject.arr(name: String): JsonArray {
    return this[name]?.jsonArray ?: error("missing $name")
}

private fun JsonObject.obj(name: String): JsonObject {
    return this[name]?.jsonObject ?: error("missing $name")
}

private fun JsonObject.intOrNull(name: String): Int? {
    val value = this[name] ?: return null
    if (value is JsonNull) return null
    return value.jsonPrimitive.int
}

private fun JsonObject.hexOrNull(name: String): ByteArray? {
    val value = this[name] ?: return null
    if (value is JsonNull) return null
    return value.jsonPrimitive.content.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
}

private fun JsonObject.utf8OrNull(name: String): ByteArray? {
    val value = this[name] ?: return null
    if (value is JsonNull) return null
    return value.jsonPrimitive.content.toByteArray(Charsets.UTF_8)
}

private fun JsonObject.hexList(name: String): List<String> {
    return arr(name).map { it.jsonPrimitive.content }
}

private fun JsonObject.stateOrNull(name: String): RoomState? {
    val value = this[name] ?: return null
    if (value is JsonNull) return null
    val state = value.jsonObject
    return RoomState(
        state.str("group_id").chunked(2).map { it.toInt(16).toByte() }.toByteArray(),
        state.str("mailbox").chunked(2).map { it.toInt(16).toByte() }.toByteArray(),
        state.str("owner").chunked(2).map { it.toInt(16).toByte() }.toByteArray(),
        state.hexList("admins").map { it.chunked(2).map { byte -> byte.toInt(16).toByte() }.toByteArray() },
        state.hexList("members").map { it.chunked(2).map { byte -> byte.toInt(16).toByte() }.toByteArray() },
        state.hexList("pending").map { it.chunked(2).map { byte -> byte.toInt(16).toByte() }.toByteArray() },
        state.int("policy"),
        state.str("name_hex").chunked(2).map { it.toInt(16).toByte() }.toByteArray(),
        state.int("epoch"),
        state.str("head_tx_id").chunked(2).map { it.toInt(16).toByte() }.toByteArray(),
        state.parentGroupId()
    )
}

private fun JsonObject.parentGroupId(): ByteArray {
    val parent = this["parent_group_id"]
    if (parent == null || parent is JsonNull) return ByteArray(32)
    return parent.jsonPrimitive.content.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
}

private fun person(id: Int): ByteArray {
    val out = ByteArray(32)
    out[0] = (id ushr 24).toByte()
    out[1] = (id ushr 16).toByte()
    out[2] = (id ushr 8).toByte()
    out[3] = id.toByte()
    return out
}

private fun marked(note: ByteArray, sender: ByteArray, n: Int): AdminEvent {
    return AdminEvent(note, sender, person(10_000 + n), n, 0)
}

private fun adminEvent(note: ByteArray, sender: ByteArray, tx: Int, round: Int = 1, offset: Int = 0): AdminEvent {
    return AdminEvent(note, sender, ByteArray(32) { tx.toByte() }, round, offset)
}
