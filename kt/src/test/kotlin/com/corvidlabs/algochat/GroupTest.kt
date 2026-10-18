package com.corvidlabs.algochat

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.io.File
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Protocols 0x06 and 0x07 against vectors/group-v1.json.
 * The session key is an input, not a handshake output.
 */
class GroupTest {
    @Test
    fun `membership note message key and message note match the vector`() {
        val session = sessionFromVector()
        val membership = Group.sealGroupMembership(
            session,
            GroupMembership(
                fixture.action,
                fixture.epoch,
                unhex(fixture.groupId),
                unhex(fixture.mailbox),
                unhex(fixture.groupKey)
            ),
            unhex(fixture.membershipNonce)
        )
        assertEquals(GroupProtocol.MEMBERSHIP_NOTE_SIZE, membership.size)
        assertEquals(195, membership.size)
        assertEquals(PQProtocol.VERSION, membership[0])
        assertEquals(GroupProtocol.MEMBERSHIP_ID, membership[1])
        assertEquals(fixture.membershipNote, hex(membership))

        val opened = Group.openGroupMembership(membership, session)
        assertEquals(1, opened.action)
        assertEquals(1, opened.epoch)
        assertEquals(fixture.groupId, hex(opened.groupId))
        assertEquals(fixture.mailbox, hex(opened.mailbox))
        assertEquals(fixture.groupKey, hex(opened.groupKey))

        val messageKey = Group.deriveGroupMessageKey(
            unhex(fixture.groupKey),
            fixture.epoch,
            fixture.counter,
            unhex(fixture.groupId),
            unhex(fixture.senderAddress)
        )
        assertEquals(32, messageKey.size)
        assertEquals(fixture.messageKey, hex(messageKey))

        val message = Group.sealGroupMessage(
            fixture.plaintext.toByteArray(Charsets.UTF_8),
            unhex(fixture.groupKey),
            unhex(fixture.groupId),
            fixture.epoch,
            fixture.counter,
            unhex(fixture.senderAddress),
            unhex(fixture.messageNonce)
        )
        assertEquals(PQProtocol.VERSION, message[0])
        assertEquals(GroupProtocol.MESSAGE_ID, message[1])
        assertEquals(fixture.messageNote, hex(message))

        val plain = Group.openGroupMessage(
            message,
            unhex(fixture.groupKey),
            unhex(fixture.senderAddress),
            emptyList()
        )
        assertEquals(fixture.plaintext, plain.plaintext.toString(Charsets.UTF_8))
        assertEquals(fixture.epoch, plain.epoch)
        assertEquals(fixture.counter, plain.counter)
        assertEquals(fixture.groupId, hex(plain.groupId))

        val otherCounter = Group.openGroupMessage(
            message,
            unhex(fixture.groupKey),
            unhex(fixture.senderAddress),
            listOf(GroupCounter(fixture.epoch, fixture.counter + 1))
        )
        assertEquals(fixture.plaintext, otherCounter.plaintext.toString(Charsets.UTF_8))
    }

    @Test
    fun `a repeated counter and a bad tag are rejected`() {
        val note = unhex(fixture.messageNote)
        val groupKey = unhex(fixture.groupKey)
        val sender = unhex(fixture.senderAddress)
        val repeated = assertThrows<AlgoChatException.DecryptionFailed> {
            Group.openGroupMessage(note, groupKey, sender, listOf(GroupCounter(1, 0)))
        }
        assertTrue(repeated.message?.contains("repeated") == true)

        val flipped = note.copyOf()
        val last = flipped.lastIndex
        flipped[last] = (flipped[last].toInt() xor 1).toByte()
        val authenticated = assertThrows<AlgoChatException.DecryptionFailed> {
            Group.openGroupMessage(flipped, groupKey, sender, emptyList())
        }
        assertTrue(authenticated.message?.contains("authentication") == true)

        val previous = ByteArray(32) { 0x98.toByte() }
        val wrongKey = assertThrows<AlgoChatException.DecryptionFailed> {
            Group.openGroupMessage(note, previous, sender, emptyList())
        }
        assertTrue(wrongKey.message?.contains("authentication") == true)

        val membership = unhex(fixture.membershipNote)
        val flippedMembership = membership.copyOf()
        val membershipLast = flippedMembership.lastIndex
        flippedMembership[membershipLast] = (flippedMembership[membershipLast].toInt() xor 1).toByte()
        val membershipAuth = assertThrows<AlgoChatException.DecryptionFailed> {
            Group.openGroupMembership(flippedMembership, sessionFromVector())
        }
        assertTrue(membershipAuth.message?.contains("authentication") == true)
    }

    @Test
    fun `epoch starts at 1 and the plaintext budget is 4026 bytes`() {
        assertEquals(4026, GroupProtocol.MAX_PAYLOAD_SIZE)
        assertEquals(54, GroupProtocol.MESSAGE_HEADER_SIZE)
        val session = sessionFromVector()
        val groupId = unhex(fixture.groupId)
        val mailbox = unhex(fixture.mailbox)
        val groupKey = unhex(fixture.groupKey)
        assertThrows<AlgoChatException.InvalidEnvelope> {
            Group.sealGroupMembership(
                session,
                GroupMembership(GroupProtocol.ACTION_CREATE, 0, groupId, mailbox, groupKey),
                unhex(fixture.membershipNonce)
            )
        }
        assertThrows<AlgoChatException.InvalidEnvelope> {
            Group.sealGroupMembership(
                session,
                GroupMembership(5, 1, groupId, mailbox, groupKey),
                unhex(fixture.membershipNonce)
            )
        }
        for (action in listOf(
            GroupProtocol.ACTION_CREATE,
            GroupProtocol.ACTION_ADD,
            GroupProtocol.ACTION_REMOVE,
            GroupProtocol.ACTION_REKEY
        )) {
            val note = Group.sealGroupMembership(
                session,
                GroupMembership(action, 1, groupId, mailbox, groupKey)
            )
            assertEquals(action, Group.openGroupMembership(note, session).action)
        }

        val sender = unhex(fixture.senderAddress)
        val body = ByteArray(GroupProtocol.MAX_PAYLOAD_SIZE) { 0x61 }
        val full = Group.sealGroupMessage(body, groupKey, groupId, 1, 1, sender)
        assertEquals(Protocol.MAX_NOTE_SIZE, full.size)
        val opened = Group.openGroupMessage(full, groupKey, sender, emptyList())
        assertTrue(opened.plaintext.contentEquals(body))
        assertThrows<AlgoChatException.EncryptionFailed> {
            Group.sealGroupMessage(
                ByteArray(GroupProtocol.MAX_PAYLOAD_SIZE + 1),
                groupKey,
                groupId,
                1,
                2,
                sender
            )
        }
    }

    private fun sessionFromVector(): PQSession {
        return PQSession(
            unhex(fixture.sessionKey),
            unhex(fixture.senderX25519),
            ByteArray(32) { 0x22 },
            unhex(fixture.handshakeId)
        )
    }

    private class Fixture(
        val sessionKey: String,
        val senderX25519: String,
        val handshakeId: String,
        val membershipNonce: String,
        val action: Int,
        val epoch: Int,
        val groupId: String,
        val mailbox: String,
        val groupKey: String,
        val membershipNote: String,
        val messageNonce: String,
        val counter: Int,
        val senderAddress: String,
        val plaintext: String,
        val messageKey: String,
        val messageNote: String
    )

    companion object {
        private val fixture = loadFixture()

        private fun loadFixture(): Fixture {
            val dir = File(System.getProperty("user.dir"))
            val file = listOf(
                File(dir, "../vectors/group-v1.json"),
                File(dir, "vectors/group-v1.json")
            ).firstOrNull { it.isFile } ?: error("group-v1.json not found from $dir")
            val text = file.readText()
            return Fixture(
                sessionKey = jsonString(text, "session_key"),
                senderX25519 = jsonString(text, "sender_x25519"),
                handshakeId = jsonString(text, "handshake_id"),
                membershipNonce = jsonString(text, "membership_nonce"),
                action = jsonInt(text, "action"),
                epoch = jsonInt(text, "epoch"),
                groupId = jsonString(text, "group_id"),
                mailbox = jsonString(text, "mailbox"),
                groupKey = jsonString(text, "group_key"),
                membershipNote = jsonString(text, "membership_note"),
                messageNonce = jsonString(text, "message_nonce"),
                counter = jsonInt(text, "counter"),
                senderAddress = jsonString(text, "sender_address"),
                plaintext = jsonString(text, "plaintext_utf8"),
                messageKey = jsonString(text, "message_key"),
                messageNote = jsonString(text, "message_note")
            )
        }

        private fun jsonString(text: String, key: String): String {
            val marker = "\"$key\""
            val keyAt = text.indexOf(marker)
            if (keyAt < 0) error("missing $key")
            val colon = text.indexOf(':', keyAt + marker.length)
            val open = text.indexOf('"', colon + 1)
            val close = text.indexOf('"', open + 1)
            return text.substring(open + 1, close)
        }

        private fun jsonInt(text: String, key: String): Int {
            val marker = "\"$key\""
            val keyAt = text.indexOf(marker)
            if (keyAt < 0) error("missing $key")
            val colon = text.indexOf(':', keyAt + marker.length)
            var index = colon + 1
            while (index < text.length && text[index].isWhitespace()) index++
            val start = index
            while (index < text.length && text[index].isDigit()) index++
            if (start == index) error("missing $key")
            return text.substring(start, index).toInt()
        }

        private fun unhex(hex: String): ByteArray {
            return hex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        }

        private fun hex(bytes: ByteArray): String {
            return bytes.joinToString("") { "%02x".format(it) }
        }
    }
}
