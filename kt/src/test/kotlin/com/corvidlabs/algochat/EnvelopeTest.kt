package com.corvidlabs.algochat

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Tests for ChatEnvelope encode/decode and isChatMessage.
 */
class EnvelopeTest {
    companion object {
        fun makeEnvelope(
            version: Byte = Protocol.VERSION,
            protocolId: Byte = Protocol.PROTOCOL_ID,
            ciphertext: ByteArray = ByteArray(16) { it.toByte() }
        ) = ChatEnvelope(
            version = version,
            protocolId = protocolId,
            senderPublicKey = ByteArray(Protocol.PUBLIC_KEY_SIZE) { 0xAA.toByte() },
            ephemeralPublicKey = ByteArray(Protocol.PUBLIC_KEY_SIZE) { 0xBB.toByte() },
            nonce = ByteArray(Protocol.NONCE_SIZE) { 0xCC.toByte() },
            encryptedSenderKey = ByteArray(Protocol.ENCRYPTED_SENDER_KEY_SIZE) { 0xDD.toByte() },
            ciphertext = ciphertext
        )
    }

    @Test
    fun `encode then decode round-trips all fields`() {
        val original = makeEnvelope()
        val decoded = ChatEnvelope.decode(original.encode())
        assertEquals(original, decoded)
    }

    @Test
    fun `encode produces correct byte length`() {
        val ct = ByteArray(42)
        val encoded = makeEnvelope(ciphertext = ct).encode()
        assertEquals(Protocol.HEADER_SIZE + 42, encoded.size)
    }

    @Test
    fun `encode places version and protocolId at correct offsets`() {
        val encoded = makeEnvelope().encode()
        assertEquals(Protocol.VERSION, encoded[0])
        assertEquals(Protocol.PROTOCOL_ID, encoded[1])
    }

    @Test
    fun `round-trip with empty ciphertext`() {
        val original = makeEnvelope(ciphertext = ByteArray(0))
        val decoded = ChatEnvelope.decode(original.encode())
        assertEquals(original, decoded)
        assertEquals(0, decoded.ciphertext.size)
    }

    @Test
    fun `round-trip with large ciphertext`() {
        val original = makeEnvelope(ciphertext = ByteArray(Protocol.MAX_PAYLOAD_SIZE) { 0xFF.toByte() })
        val decoded = ChatEnvelope.decode(original.encode())
        assertEquals(original, decoded)
    }

    @Test
    fun `decode rejects data shorter than header`() {
        val ex = assertThrows<AlgoChatException.InvalidEnvelope> {
            ChatEnvelope.decode(ByteArray(Protocol.HEADER_SIZE - 1))
        }
        assertTrue(ex.message!!.contains("too short"))
    }

    @Test
    fun `decode rejects unknown version`() {
        val encoded = makeEnvelope().encode()
        encoded[0] = 0x99.toByte()
        val ex = assertThrows<AlgoChatException.InvalidEnvelope> {
            ChatEnvelope.decode(encoded)
        }
        assertTrue(ex.message!!.contains("version"))
    }

    @Test
    fun `decode rejects unknown protocol ID`() {
        val encoded = makeEnvelope().encode()
        encoded[1] = 0x99.toByte()
        val ex = assertThrows<AlgoChatException.InvalidEnvelope> {
            ChatEnvelope.decode(encoded)
        }
        assertTrue(ex.message!!.contains("protocol"))
    }

    @Test
    fun `decode header-only envelope has empty ciphertext`() {
        val encoded = makeEnvelope(ciphertext = ByteArray(0)).encode()
        assertEquals(Protocol.HEADER_SIZE, encoded.size)
        val decoded = ChatEnvelope.decode(encoded)
        assertEquals(0, decoded.ciphertext.size)
    }

    @Test
    fun `equals and hashCode work correctly`() {
        val a = makeEnvelope()
        val b = makeEnvelope()
        assertEquals(a, b)
        assertEquals(a.hashCode(), b.hashCode())
    }

    // isChatMessage tests

    @Test
    fun `isChatMessage returns true for valid envelope`() {
        assertTrue(isChatMessage(makeEnvelope().encode()))
    }

    @Test
    fun `isChatMessage returns false for short data`() {
        assertFalse(isChatMessage(ByteArray(10)))
    }

    @Test
    fun `isChatMessage returns false for wrong version`() {
        val encoded = makeEnvelope().encode()
        encoded[0] = 0x00
        assertFalse(isChatMessage(encoded))
    }

    @Test
    fun `isChatMessage returns false for wrong protocol ID`() {
        val encoded = makeEnvelope().encode()
        encoded[1] = 0x00
        assertFalse(isChatMessage(encoded))
    }
}
