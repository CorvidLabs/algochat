package com.corvidlabs.algochat

import org.bouncycastle.crypto.InvalidCipherTextException
import org.bouncycastle.crypto.digests.SHA256Digest
import org.bouncycastle.crypto.generators.HKDFBytesGenerator
import org.bouncycastle.crypto.modes.ChaCha20Poly1305
import org.bouncycastle.crypto.params.AEADParameters
import org.bouncycastle.crypto.params.HKDFParameters
import org.bouncycastle.crypto.params.KeyParameter
import java.security.SecureRandom

/**
 * Group mailbox constants.
 *
 * Protocol 0x06 carries the group key. Protocol 0x07 carries one mailbox message.
 */
object GroupProtocol {
    const val MEMBERSHIP_ID: Byte = 0x06
    const val MESSAGE_ID: Byte = 0x07

    const val ACTION_CREATE = 1
    const val ACTION_ADD = 2
    const val ACTION_REMOVE = 3
    const val ACTION_REKEY = 4

    /** action, epoch, group id, mailbox, group key. */
    const val MEMBERSHIP_PLAINTEXT_SIZE = 101

    /** 78-byte header, 101-byte plaintext, 16-byte tag. */
    const val MEMBERSHIP_NOTE_SIZE =
        PQProtocol.DATA_HEADER_SIZE + MEMBERSHIP_PLAINTEXT_SIZE + Protocol.TAG_SIZE

    /** version, protocol, group id, epoch, counter, nonce. */
    const val MESSAGE_HEADER_SIZE = 54

    /** 4096-byte note, minus the 54-byte header and 16-byte Poly1305 tag. */
    const val MAX_PAYLOAD_SIZE = Protocol.MAX_NOTE_SIZE - MESSAGE_HEADER_SIZE - Protocol.TAG_SIZE

    val INFO_LABEL = "AlgoChat-group-v1".toByteArray(Charsets.UTF_8)
}

/** One group-key delivery. Epoch starts at 1. */
class GroupMembership(
    val action: Int,
    val epoch: Int,
    val groupId: ByteArray,
    val mailbox: ByteArray,
    val groupKey: ByteArray
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is GroupMembership) return false
        return action == other.action &&
            epoch == other.epoch &&
            groupId.contentEquals(other.groupId) &&
            mailbox.contentEquals(other.mailbox) &&
            groupKey.contentEquals(other.groupKey)
    }

    override fun hashCode(): Int {
        var result = action
        result = 31 * result + epoch
        result = 31 * result + groupId.contentHashCode()
        result = 31 * result + mailbox.contentHashCode()
        result = 31 * result + groupKey.contentHashCode()
        return result
    }
}

/** An epoch and counter already accepted for one sender. */
data class GroupCounter(
    val epoch: Int,
    val counter: Int
)

/** Plaintext opened from a 0x07 note. */
class OpenedGroupMessage(
    val plaintext: ByteArray,
    val groupId: ByteArray,
    val epoch: Int,
    val counter: Int
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is OpenedGroupMessage) return false
        return epoch == other.epoch &&
            counter == other.counter &&
            plaintext.contentEquals(other.plaintext) &&
            groupId.contentEquals(other.groupId)
    }

    override fun hashCode(): Int {
        var result = plaintext.contentHashCode()
        result = 31 * result + groupId.contentHashCode()
        result = 31 * result + epoch
        result = 31 * result + counter
        return result
    }
}

/**
 * Group mailbox notes.
 *
 * A 0x06 note is sealed under a hybrid session key. That key is an input.
 * A 0x07 note is sealed under a key derived from the group key.
 */
object Group {
    private val secureRandom = SecureRandom()

    fun isGroupMembership(note: ByteArray): Boolean {
        return note.size == GroupProtocol.MEMBERSHIP_NOTE_SIZE &&
            note[0] == PQProtocol.VERSION &&
            note[1] == GroupProtocol.MEMBERSHIP_ID
    }

    fun isGroupMessage(note: ByteArray): Boolean {
        return note.size >= GroupProtocol.MESSAGE_HEADER_SIZE + Protocol.TAG_SIZE &&
            note.size <= Protocol.MAX_NOTE_SIZE &&
            note[0] == PQProtocol.VERSION &&
            note[1] == GroupProtocol.MESSAGE_ID
    }

    /**
     * Seal a 0x06 membership note.
     *
     * The header is 78 bytes and is the AEAD associated data.
     * The plaintext is 101 bytes. [nonce] is 12 bytes. Omit it for a random nonce.
     */
    fun sealGroupMembership(
        session: PQSession,
        membership: GroupMembership,
        nonce: ByteArray? = null
    ): ByteArray {
        requireSession(session)
        val plaintext = encodeMembership(membership)
        val chosen = nonce ?: randomBytes(Protocol.NONCE_SIZE)
        requireSize("nonce", chosen, Protocol.NONCE_SIZE)
        val header = membershipHeader(session, chosen)
        val sealed = aeadEncrypt(session.sessionKey, chosen, plaintext, header)
        val note = header + sealed
        if (note.size != GroupProtocol.MEMBERSHIP_NOTE_SIZE) {
            throw AlgoChatException.EncryptionFailed("Group membership note is ${note.size} bytes")
        }
        return note
    }

    /** Open a 0x06 note with the session key that sealed it. */
    fun openGroupMembership(note: ByteArray, session: PQSession): GroupMembership {
        requireSession(session)
        if (!isGroupMembership(note)) {
            throw AlgoChatException.InvalidEnvelope("Not a group membership note")
        }
        val senderPublicKey = note.copyOfRange(2, 34)
        val handshakeId = note.copyOfRange(34, 66)
        val nonce = note.copyOfRange(66, 78)
        if (!senderPublicKey.contentEquals(session.senderPublicKey)) {
            throw AlgoChatException.DecryptionFailed("Membership sender does not match the handshake")
        }
        if (!handshakeId.contentEquals(session.handshakeId)) {
            throw AlgoChatException.DecryptionFailed("Membership is for a different handshake")
        }
        val header = note.copyOfRange(0, PQProtocol.DATA_HEADER_SIZE)
        val ciphertext = note.copyOfRange(PQProtocol.DATA_HEADER_SIZE, note.size)
        val plaintext = try {
            aeadDecrypt(session.sessionKey, nonce, ciphertext, header)
        } catch (e: InvalidCipherTextException) {
            throw AlgoChatException.DecryptionFailed("Group membership authentication failed")
        }
        return decodeMembership(plaintext)
    }

    /**
     * Derive the 0x07 message key.
     *
     * HKDF-SHA256, 32 bytes. Salt is epoch and counter. IKM is the group key.
     * Info is AlgoChat-group-v1, the group id, and the sender address.
     */
    fun deriveGroupMessageKey(
        groupKey: ByteArray,
        epoch: Int,
        counter: Int,
        groupId: ByteArray,
        senderAddress: ByteArray
    ): ByteArray {
        requireSize("group key", groupKey, 32)
        requireSize("group id", groupId, 32)
        requireSize("sender address", senderAddress, 32)
        requireEpoch(epoch)
        requireCounter(counter)
        val salt = ByteArray(8)
        writeU32(salt, 0, epoch)
        writeU32(salt, 4, counter)
        val info = "AlgoChat-group-v1".toByteArray(Charsets.UTF_8) + groupId + senderAddress
        return hkdf(groupKey, salt, info)
    }

    /**
     * Seal a 0x07 note.
     *
     * The 54-byte header is the AEAD associated data.
     * [nonce] is 12 bytes. Omit it for a random nonce.
     */
    fun sealGroupMessage(
        plaintext: ByteArray,
        groupKey: ByteArray,
        groupId: ByteArray,
        epoch: Int,
        counter: Int,
        senderAddress: ByteArray,
        nonce: ByteArray? = null
    ): ByteArray {
        if (plaintext.size > GroupProtocol.MAX_PAYLOAD_SIZE) {
            throw AlgoChatException.EncryptionFailed(
                "Group message too large: ${plaintext.size} bytes (max ${GroupProtocol.MAX_PAYLOAD_SIZE})"
            )
        }
        val chosen = nonce ?: randomBytes(Protocol.NONCE_SIZE)
        requireSize("nonce", chosen, Protocol.NONCE_SIZE)
        val messageKey = deriveGroupMessageKey(groupKey, epoch, counter, groupId, senderAddress)
        val header = messageHeader(groupId, epoch, counter, chosen)
        val sealed = aeadEncrypt(messageKey, chosen, plaintext, header)
        val note = header + sealed
        if (note.size > Protocol.MAX_NOTE_SIZE) {
            throw AlgoChatException.EncryptionFailed("Group message note is ${note.size} bytes")
        }
        return note
    }

    /**
     * Open a 0x07 note.
     *
     * [accepted] lists epoch and counter pairs already seen for this sender.
     * A repeat is rejected. A bad tag does not return plaintext.
     */
    fun openGroupMessage(
        note: ByteArray,
        groupKey: ByteArray,
        senderAddress: ByteArray,
        accepted: List<GroupCounter>
    ): OpenedGroupMessage {
        if (!isGroupMessage(note)) {
            throw AlgoChatException.InvalidEnvelope("Not a group message")
        }
        val groupId = note.copyOfRange(2, 34)
        val epoch = readU32(note, 34)
        val counter = readU32(note, 38)
        val nonce = note.copyOfRange(42, 54)
        requireEpoch(epoch)
        requireCounter(counter)
        if (accepted.any { it.epoch == epoch && it.counter == counter }) {
            throw AlgoChatException.DecryptionFailed("repeated group counter")
        }
        val messageKey = deriveGroupMessageKey(groupKey, epoch, counter, groupId, senderAddress)
        val header = note.copyOfRange(0, GroupProtocol.MESSAGE_HEADER_SIZE)
        val ciphertext = note.copyOfRange(GroupProtocol.MESSAGE_HEADER_SIZE, note.size)
        val plaintext = try {
            aeadDecrypt(messageKey, nonce, ciphertext, header)
        } catch (e: InvalidCipherTextException) {
            throw AlgoChatException.DecryptionFailed("Group message authentication failed")
        }
        return OpenedGroupMessage(plaintext, groupId, epoch, counter)
    }

    private fun requireSession(session: PQSession) {
        requireSize("session key", session.sessionKey, 32)
        requireSize("sender public key", session.senderPublicKey, 32)
        requireSize("handshake id", session.handshakeId, 32)
    }

    private fun encodeMembership(membership: GroupMembership): ByteArray {
        requireAction(membership.action)
        requireEpoch(membership.epoch)
        requireSize("group id", membership.groupId, 32)
        requireSize("mailbox", membership.mailbox, 32)
        requireSize("group key", membership.groupKey, 32)
        val out = ByteArray(GroupProtocol.MEMBERSHIP_PLAINTEXT_SIZE)
        out[0] = membership.action.toByte()
        writeU32(out, 1, membership.epoch)
        membership.groupId.copyInto(out, 5)
        membership.mailbox.copyInto(out, 37)
        membership.groupKey.copyInto(out, 69)
        return out
    }

    private fun decodeMembership(plaintext: ByteArray): GroupMembership {
        if (plaintext.size != GroupProtocol.MEMBERSHIP_PLAINTEXT_SIZE) {
            throw AlgoChatException.InvalidEnvelope("Group membership plaintext is the wrong length")
        }
        val membership = GroupMembership(
            plaintext[0].toInt() and 0xff,
            readU32(plaintext, 1),
            plaintext.copyOfRange(5, 37),
            plaintext.copyOfRange(37, 69),
            plaintext.copyOfRange(69, 101)
        )
        encodeMembership(membership)
        return membership
    }

    private fun membershipHeader(session: PQSession, nonce: ByteArray): ByteArray {
        val header = ByteArray(PQProtocol.DATA_HEADER_SIZE)
        header[0] = PQProtocol.VERSION
        header[1] = GroupProtocol.MEMBERSHIP_ID
        session.senderPublicKey.copyInto(header, 2)
        session.handshakeId.copyInto(header, 34)
        nonce.copyInto(header, 66)
        return header
    }

    private fun messageHeader(groupId: ByteArray, epoch: Int, counter: Int, nonce: ByteArray): ByteArray {
        val header = ByteArray(GroupProtocol.MESSAGE_HEADER_SIZE)
        header[0] = PQProtocol.VERSION
        header[1] = GroupProtocol.MESSAGE_ID
        groupId.copyInto(header, 2)
        writeU32(header, 34, epoch)
        writeU32(header, 38, counter)
        nonce.copyInto(header, 42)
        return header
    }

    private fun requireAction(action: Int) {
        if (action != GroupProtocol.ACTION_CREATE &&
            action != GroupProtocol.ACTION_ADD &&
            action != GroupProtocol.ACTION_REMOVE &&
            action != GroupProtocol.ACTION_REKEY
        ) {
            throw AlgoChatException.InvalidEnvelope("Group action is not create, add, remove, or rekey")
        }
    }

    private fun requireEpoch(epoch: Int) {
        if (epoch < 1) {
            throw AlgoChatException.InvalidEnvelope("Group epoch must be at least 1")
        }
    }

    private fun requireCounter(counter: Int) {
        if (counter < 0) {
            throw AlgoChatException.InvalidEnvelope("Group counter must be at least 0")
        }
    }

    private fun writeU32(target: ByteArray, offset: Int, value: Int) {
        target[offset] = (value ushr 24).toByte()
        target[offset + 1] = (value ushr 16).toByte()
        target[offset + 2] = (value ushr 8).toByte()
        target[offset + 3] = value.toByte()
    }

    private fun readU32(source: ByteArray, offset: Int): Int {
        return ((source[offset].toInt() and 0xff) shl 24) or
            ((source[offset + 1].toInt() and 0xff) shl 16) or
            ((source[offset + 2].toInt() and 0xff) shl 8) or
            (source[offset + 3].toInt() and 0xff)
    }

    private fun randomBytes(size: Int): ByteArray {
        val bytes = ByteArray(size)
        secureRandom.nextBytes(bytes)
        return bytes
    }

    private fun hkdf(ikm: ByteArray, salt: ByteArray, info: ByteArray): ByteArray {
        val hkdf = HKDFBytesGenerator(SHA256Digest())
        hkdf.init(HKDFParameters(ikm, salt, info))
        val key = ByteArray(32)
        hkdf.generateBytes(key, 0, 32)
        return key
    }

    private fun requireSize(name: String, value: ByteArray, size: Int) {
        if (value.size != size) {
            throw AlgoChatException.InvalidEnvelope("$name must be $size bytes, got ${value.size}")
        }
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
