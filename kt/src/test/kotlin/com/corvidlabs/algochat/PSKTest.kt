package com.corvidlabs.algochat

import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class PSKTest {
    companion object {
        const val ALICE_SEED_HEX = "0000000000000000000000000000000000000000000000000000000000000001"
        const val BOB_SEED_HEX = "0000000000000000000000000000000000000000000000000000000000000002"

        /** Test PSK: 32 bytes of 0xAA. */
        val TEST_PSK = ByteArray(32) { 0xAA.toByte() }

        /** Expected test vectors for PSK ratchet derivation. */
        const val SESSION_0_HEX = "a031707ea9e9e50bd8ea4eb9a2bd368465ea1aff14caab293d38954b4717e888"
        const val SESSION_1_HEX = "994cffbb4f84fa5410d44574bb9fa7408a8c2f1ed2b3a00f5168fc74c71f7cea"
        const val COUNTER_0_HEX = "2918fd486b9bd024d712f6234b813c0f4167237d60c2c1fca37326b20497c165"
        const val COUNTER_99_HEX = "5b48a50a25261f6b63fe9c867b46be46de4d747c3477db6290045ba519a4d38b"
        const val COUNTER_100_HEX = "7a15d3add6a28858e6a1f1ea0d22bdb29b7e129a1330c4908d9b46a460992694"

        fun hexToBytes(hex: String): ByteArray {
            return hex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        }

        fun bytesToHex(bytes: ByteArray): String {
            return bytes.joinToString("") { "%02x".format(it) }
        }

        fun aliceKeys(): KeyPair {
            return Keys.deriveKeysFromSeed(hexToBytes(ALICE_SEED_HEX))
        }

        fun bobKeys(): KeyPair {
            return Keys.deriveKeysFromSeed(hexToBytes(BOB_SEED_HEX))
        }
    }

    // ========================================================================
    // PSK Ratchet Vector Tests
    // ========================================================================

    @Test
    fun `PSK ratchet session 0 derivation`() {
        val session0 = PSKRatchet.deriveSessionPSK(TEST_PSK, 0u)
        assertEquals(SESSION_0_HEX, bytesToHex(session0))
    }

    @Test
    fun `PSK ratchet session 1 derivation`() {
        val session1 = PSKRatchet.deriveSessionPSK(TEST_PSK, 1u)
        assertEquals(SESSION_1_HEX, bytesToHex(session1))
    }

    @Test
    fun `PSK ratchet counter 0 derivation`() {
        val counter0 = PSKRatchet.derivePSKAtCounter(TEST_PSK, 0u)
        assertEquals(COUNTER_0_HEX, bytesToHex(counter0))
    }

    @Test
    fun `PSK ratchet counter 99 derivation`() {
        val counter99 = PSKRatchet.derivePSKAtCounter(TEST_PSK, 99u)
        assertEquals(COUNTER_99_HEX, bytesToHex(counter99))
    }

    @Test
    fun `PSK ratchet counter 100 derivation`() {
        val counter100 = PSKRatchet.derivePSKAtCounter(TEST_PSK, 100u)
        assertEquals(COUNTER_100_HEX, bytesToHex(counter100))
    }

    @Test
    fun `PSK ratchet counter 100 uses session 1`() {
        // Counter 100 should use session 1, position 0
        val session1 = PSKRatchet.deriveSessionPSK(TEST_PSK, 1u)
        val position0 = PSKRatchet.derivePositionPSK(session1, 0u)
        val counter100 = PSKRatchet.derivePSKAtCounter(TEST_PSK, 100u)

        assertTrue(position0.contentEquals(counter100))
    }

    @Test
    fun `PSK ratchet different counters produce different keys`() {
        val key0 = PSKRatchet.derivePSKAtCounter(TEST_PSK, 0u)
        val key1 = PSKRatchet.derivePSKAtCounter(TEST_PSK, 1u)
        val key100 = PSKRatchet.derivePSKAtCounter(TEST_PSK, 100u)

        assertFalse(key0.contentEquals(key1))
        assertFalse(key0.contentEquals(key100))
        assertFalse(key1.contentEquals(key100))
    }

    @Test
    fun `PSK ratchet deterministic`() {
        val key1 = PSKRatchet.derivePSKAtCounter(TEST_PSK, 42u)
        val key2 = PSKRatchet.derivePSKAtCounter(TEST_PSK, 42u)

        assertTrue(key1.contentEquals(key2))
    }

    @Test
    fun `PSK ratchet invalid PSK size throws`() {
        assertThrows<IllegalArgumentException> {
            PSKRatchet.deriveSessionPSK(ByteArray(16), 0u)
        }
    }

    // ========================================================================
    // PSK Envelope Encode/Decode Tests
    // ========================================================================

    @Test
    fun `PSK envelope encode decode roundtrip`() {
        val alice = aliceKeys()
        val bob = bobKeys()
        val psk = PSKRatchet.derivePSKAtCounter(TEST_PSK, 0u)

        val envelope = PSKCrypto.encryptMessage(
            "Test PSK message",
            alice.privateKey,
            alice.publicKey,
            bob.publicKey,
            psk,
            0u
        )

        val encoded = PSKEnvelopeCodec.encode(envelope)
        assertTrue(encoded.size >= PSKProtocol.HEADER_SIZE)
        assertTrue(isPSKMessage(encoded))

        val decoded = PSKEnvelopeCodec.decode(encoded)
        assertEquals(envelope.ratchetCounter, decoded.ratchetCounter)
        assertTrue(envelope.senderPublicKey.contentEquals(decoded.senderPublicKey))
        assertTrue(envelope.ephemeralPublicKey.contentEquals(decoded.ephemeralPublicKey))
        assertTrue(envelope.nonce.contentEquals(decoded.nonce))
        assertTrue(envelope.encryptedSenderKey.contentEquals(decoded.encryptedSenderKey))
        assertTrue(envelope.ciphertext.contentEquals(decoded.ciphertext))
    }

    @Test
    fun `PSK envelope header format`() {
        val alice = aliceKeys()
        val bob = bobKeys()
        val psk = PSKRatchet.derivePSKAtCounter(TEST_PSK, 0u)

        val envelope = PSKCrypto.encryptMessage(
            "Test",
            alice.privateKey,
            alice.publicKey,
            bob.publicKey,
            psk,
            42u
        )

        val encoded = PSKEnvelopeCodec.encode(envelope)

        // Check version and protocol ID
        assertEquals(PSKProtocol.VERSION, encoded[0])
        assertEquals(PSKProtocol.PROTOCOL_ID, encoded[1])

        // Check ratchet counter (bytes 2-5, big-endian)
        val counter = ((encoded[2].toInt() and 0xFF) shl 24) or
            ((encoded[3].toInt() and 0xFF) shl 16) or
            ((encoded[4].toInt() and 0xFF) shl 8) or
            (encoded[5].toInt() and 0xFF)
        assertEquals(42, counter)
    }

    @Test
    fun `PSK envelope too short throws`() {
        assertThrows<AlgoChatException> {
            PSKEnvelopeCodec.decode(ByteArray(10))
        }
    }

    @Test
    fun `PSK envelope wrong version throws`() {
        val data = ByteArray(PSKProtocol.HEADER_SIZE + 16)
        data[0] = 0x02 // Wrong version
        data[1] = PSKProtocol.PROTOCOL_ID

        assertThrows<AlgoChatException> {
            PSKEnvelopeCodec.decode(data)
        }
    }

    @Test
    fun `PSK envelope wrong protocol throws`() {
        val data = ByteArray(PSKProtocol.HEADER_SIZE + 16)
        data[0] = PSKProtocol.VERSION
        data[1] = 0x01 // Wrong protocol (v1.0, not PSK)

        assertThrows<AlgoChatException> {
            PSKEnvelopeCodec.decode(data)
        }
    }

    @Test
    fun `isPSKMessage detection`() {
        val validHeader = ByteArray(PSKProtocol.HEADER_SIZE + 16)
        validHeader[0] = PSKProtocol.VERSION
        validHeader[1] = PSKProtocol.PROTOCOL_ID
        assertTrue(isPSKMessage(validHeader))

        // Too short
        assertFalse(isPSKMessage(byteArrayOf(PSKProtocol.VERSION, PSKProtocol.PROTOCOL_ID)))

        // Wrong protocol (v1.0)
        val v1Header = ByteArray(PSKProtocol.HEADER_SIZE + 16)
        v1Header[0] = Protocol.VERSION
        v1Header[1] = Protocol.PROTOCOL_ID
        assertFalse(isPSKMessage(v1Header))

        // Empty
        assertFalse(isPSKMessage(byteArrayOf()))
    }

    // ========================================================================
    // PSK Encrypt/Decrypt Tests
    // ========================================================================

    @Test
    fun `PSK encrypt decrypt roundtrip`() {
        val alice = aliceKeys()
        val bob = bobKeys()
        val psk = PSKRatchet.derivePSKAtCounter(TEST_PSK, 0u)
        val message = "Hello from PSK Kotlin!"

        val envelope = PSKCrypto.encryptMessage(
            message,
            alice.privateKey,
            alice.publicKey,
            bob.publicKey,
            psk,
            0u
        )

        val decrypted = PSKCrypto.decryptMessage(
            envelope,
            bob.privateKey,
            bob.publicKey,
            psk
        )

        assertNotNull(decrypted)
        assertEquals(message, decrypted.text)
    }

    @Test
    fun `PSK sender can decrypt own message`() {
        val alice = aliceKeys()
        val bob = bobKeys()
        val psk = PSKRatchet.derivePSKAtCounter(TEST_PSK, 0u)
        val message = "I sent this with PSK!"

        val envelope = PSKCrypto.encryptMessage(
            message,
            alice.privateKey,
            alice.publicKey,
            bob.publicKey,
            psk,
            0u
        )

        val decrypted = PSKCrypto.decryptMessage(
            envelope,
            alice.privateKey,
            alice.publicKey,
            psk
        )

        assertNotNull(decrypted)
        assertEquals(message, decrypted.text)
    }

    @Test
    fun `PSK encrypt decrypt with different counters`() {
        val alice = aliceKeys()
        val bob = bobKeys()

        for (counter in listOf(0u, 1u, 50u, 99u, 100u, 150u, 200u)) {
            val psk = PSKRatchet.derivePSKAtCounter(TEST_PSK, counter)
            val message = "Message at counter $counter"

            val envelope = PSKCrypto.encryptMessage(
                message,
                alice.privateKey,
                alice.publicKey,
                bob.publicKey,
                psk,
                counter
            )

            val decrypted = PSKCrypto.decryptMessage(
                envelope,
                bob.privateKey,
                bob.publicKey,
                psk
            )

            assertNotNull(decrypted, "Failed to decrypt at counter $counter")
            assertEquals(message, decrypted.text, "Message mismatch at counter $counter")
        }
    }

    @Test
    fun `PSK wrong PSK fails decryption`() {
        val alice = aliceKeys()
        val bob = bobKeys()
        val correctPSK = PSKRatchet.derivePSKAtCounter(TEST_PSK, 0u)
        val wrongPSK = PSKRatchet.derivePSKAtCounter(TEST_PSK, 1u)

        val envelope = PSKCrypto.encryptMessage(
            "Secret message",
            alice.privateKey,
            alice.publicKey,
            bob.publicKey,
            correctPSK,
            0u
        )

        assertThrows<Exception> {
            PSKCrypto.decryptMessage(
                envelope,
                bob.privateKey,
                bob.publicKey,
                wrongPSK
            )
        }
    }

    @Test
    fun `PSK message too large throws`() {
        val alice = aliceKeys()
        val bob = bobKeys()
        val psk = PSKRatchet.derivePSKAtCounter(TEST_PSK, 0u)
        val message = "A".repeat(PSKProtocol.MAX_PAYLOAD_SIZE + 1)

        assertThrows<AlgoChatException> {
            PSKCrypto.encryptMessage(
                message,
                alice.privateKey,
                alice.publicKey,
                bob.publicKey,
                psk,
                0u
            )
        }
    }

    @Test
    fun `PSK note ceiling keeps the header and tag and raises plaintext to 3950`() {
        assertEquals(130, PSKProtocol.HEADER_SIZE)
        assertEquals(16, PSKProtocol.TAG_SIZE)
        assertEquals(3950, PSKProtocol.MAX_PAYLOAD_SIZE)
    }

    @Test
    fun `legacy 878 byte PSK plaintext still encrypts within 1024 bytes`() {
        val alice = aliceKeys()
        val bob = bobKeys()
        val psk = PSKRatchet.derivePSKAtCounter(TEST_PSK, 0u)
        val message = "A".repeat(878)

        val envelope = PSKCrypto.encryptMessage(
            message,
            alice.privateKey,
            alice.publicKey,
            bob.publicKey,
            psk,
            0u
        )
        val encoded = PSKEnvelopeCodec.encode(envelope)

        assertTrue(encoded.size <= 1024)
        val decrypted = PSKCrypto.decryptMessage(envelope, bob.privateKey, bob.publicKey, psk)
        assertNotNull(decrypted)
        assertEquals(message, decrypted.text)
    }

    @Test
    fun `PSK maximum plaintext encodes to a 4096 byte note`() {
        val alice = aliceKeys()
        val bob = bobKeys()
        val psk = PSKRatchet.derivePSKAtCounter(TEST_PSK, 0u)
        val message = "A".repeat(PSKProtocol.MAX_PAYLOAD_SIZE)

        val encoded = PSKEnvelopeCodec.encode(
            PSKCrypto.encryptMessage(
                message,
                alice.privateKey,
                alice.publicKey,
                bob.publicKey,
                psk,
                0u
            )
        )

        assertEquals(4096, encoded.size)
    }

    @Test
    fun `one byte past the PSK maximum fails before an envelope is built`() {
        val alice = aliceKeys()
        val bob = bobKeys()
        val psk = PSKRatchet.derivePSKAtCounter(TEST_PSK, 0u)
        val message = "A".repeat(PSKProtocol.MAX_PAYLOAD_SIZE + 1)

        assertThrows<AlgoChatException.EncryptionFailed> {
            PSKCrypto.encryptMessage(
                message,
                alice.privateKey,
                alice.publicKey,
                bob.publicKey,
                psk,
                0u
            )
        }
    }

    @Test
    fun `PSK full encode decode decrypt roundtrip`() {
        val alice = aliceKeys()
        val bob = bobKeys()
        val psk = PSKRatchet.derivePSKAtCounter(TEST_PSK, 5u)
        val message = "Full roundtrip test!"

        val envelope = PSKCrypto.encryptMessage(
            message,
            alice.privateKey,
            alice.publicKey,
            bob.publicKey,
            psk,
            5u
        )

        val encoded = PSKEnvelopeCodec.encode(envelope)
        val decoded = PSKEnvelopeCodec.decode(encoded)

        assertEquals(5u, decoded.ratchetCounter)

        val decrypted = PSKCrypto.decryptMessage(
            decoded,
            bob.privateKey,
            bob.publicKey,
            psk
        )

        assertNotNull(decrypted)
        assertEquals(message, decrypted.text)
    }

    // ========================================================================
    // PSK All Message Types Tests
    // ========================================================================

    @Test
    fun `PSK all message types encrypt decrypt correctly`() {
        val alice = aliceKeys()
        val bob = bobKeys()
        val psk = PSKRatchet.derivePSKAtCounter(TEST_PSK, 0u)

        val testMessages = mapOf(
            "empty" to "",
            "single_char" to "X",
            "whitespace" to "   \t\n   ",
            "numbers" to "1234567890",
            "punctuation" to "!@#\$%^&*()_+-=[]{}\\|;':\",./<>?",
            "newlines" to "Line 1\nLine 2\nLine 3",
            "emoji_simple" to "Hello 👋 World 🌍",
            "emoji_zwj" to "Family: 👨‍👩‍👧‍👦",
            "chinese" to "你好世界 - Hello World",
            "arabic" to "مرحبا بالعالم",
            "japanese" to "こんにちは世界 カタカナ 漢字",
            "korean" to "안녕하세요 세계",
            "accents" to "Café résumé naïve",
            "cyrillic" to "Привет мир",
            "json" to """{"key": "value", "num": 42}""",
            "html" to """<div class="test">Content</div>""",
            "url" to "https://example.com/path?q=test&lang=en",
            "code" to """func hello() { print("Hi") }""",
            "long_text" to "The quick brown fox jumps over the lazy dog. ".repeat(11),
            "max_payload" to "A".repeat(PSKProtocol.MAX_PAYLOAD_SIZE)
        )

        for ((key, message) in testMessages) {
            val envelope = PSKCrypto.encryptMessage(
                message,
                alice.privateKey,
                alice.publicKey,
                bob.publicKey,
                psk,
                0u
            )

            // Decrypt as recipient
            val decryptedBob = PSKCrypto.decryptMessage(
                envelope, bob.privateKey, bob.publicKey, psk
            )
            assertNotNull(decryptedBob, "PSK: Failed to decrypt $key as recipient")
            assertEquals(message, decryptedBob.text, "PSK: Message mismatch for $key")

            // Decrypt as sender (bidirectional)
            val decryptedAlice = PSKCrypto.decryptMessage(
                envelope, alice.privateKey, alice.publicKey, psk
            )
            assertNotNull(decryptedAlice, "PSK: Failed to decrypt $key as sender")
            assertEquals(message, decryptedAlice.text, "PSK: Bidirectional mismatch for $key")
        }
    }

    // ========================================================================
    // PSK State Counter Management Tests
    // ========================================================================

    @Test
    fun `PSK state initial counters`() = runTest {
        val state = PSKState(TEST_PSK, "test-peer")
        assertEquals(0u, state.sendCounter)
        assertEquals(0u, state.receiveCounter)
    }

    @Test
    fun `PSK state send counter increments`() = runTest {
        val state = PSKState(TEST_PSK, "test-peer")

        assertEquals(0u, state.nextSendCounter())
        assertEquals(1u, state.sendCounter)

        assertEquals(1u, state.nextSendCounter())
        assertEquals(2u, state.sendCounter)

        assertEquals(2u, state.nextSendCounter())
        assertEquals(3u, state.sendCounter)
    }

    @Test
    fun `PSK state receive counter accepts valid`() = runTest {
        val state = PSKState(TEST_PSK, "test-peer")

        assertTrue(state.acceptReceiveCounter(0u))
        assertTrue(state.acceptReceiveCounter(1u))
        assertTrue(state.acceptReceiveCounter(5u))
    }

    @Test
    fun `PSK state receive counter rejects replay`() = runTest {
        val state = PSKState(TEST_PSK, "test-peer")

        assertTrue(state.acceptReceiveCounter(0u))
        assertFalse(state.acceptReceiveCounter(0u)) // Replay
    }

    @Test
    fun `PSK state receive counter accepts out of order`() = runTest {
        val state = PSKState(TEST_PSK, "test-peer")

        assertTrue(state.acceptReceiveCounter(5u))
        assertTrue(state.acceptReceiveCounter(3u)) // Out of order, but in window
        assertTrue(state.acceptReceiveCounter(4u)) // Fill gap
    }

    @Test
    fun `PSK state receive counter rejects too old`() = runTest {
        val state = PSKState(TEST_PSK, "test-peer")

        // Advance receive counter well past the window
        for (i in 0u until 300u) {
            state.acceptReceiveCounter(i)
        }

        // Counter 0 should now be outside the window
        assertFalse(state.acceptReceiveCounter(0u))
    }

    @Test
    fun `PSK state reset clears counters`() = runTest {
        val state = PSKState(TEST_PSK, "test-peer")

        state.nextSendCounter()
        state.nextSendCounter()
        state.acceptReceiveCounter(5u)

        state.reset()

        assertEquals(0u, state.sendCounter)
        assertEquals(0u, state.receiveCounter)
    }

    @Test
    fun `PSK state accepts counters far ahead`() = runTest {
        val state = PSKState(TEST_PSK, "test-peer")

        // No upper bound: a counter arbitrarily far ahead advances the window.
        assertTrue(state.acceptReceiveCounter(0u))
        assertTrue(state.acceptReceiveCounter(10_000u))
        assertEquals(10_001u, state.receiveCounter)
    }

    @Test
    fun `PSK receive decrypts and records counter`() = runTest {
        val alice = aliceKeys()
        val bob = bobKeys()
        val counter = 3u
        val psk = PSKRatchet.derivePSKAtCounter(TEST_PSK, counter)
        val message = "Replay-protected message"

        val envelope = PSKCrypto.encryptMessage(
            message, alice.privateKey, alice.publicKey, bob.publicKey, psk, counter
        )

        val bobState = PSKState(TEST_PSK, "alice")
        val decrypted = bobState.receive(envelope.ratchetCounter) {
            PSKCrypto.decryptMessage(envelope, bob.privateKey, bob.publicKey, psk)
        }

        assertNotNull(decrypted)
        assertEquals(message, decrypted.text)
        // Counter recorded after success.
        assertFalse(bobState.acceptReceiveCounter(counter))
    }

    @Test
    fun `PSK receive rejects replayed envelope`() = runTest {
        val alice = aliceKeys()
        val bob = bobKeys()
        val counter = 7u
        val psk = PSKRatchet.derivePSKAtCounter(TEST_PSK, counter)

        val envelope = PSKCrypto.encryptMessage(
            "Once only", alice.privateKey, alice.publicKey, bob.publicKey, psk, counter
        )

        val bobState = PSKState(TEST_PSK, "alice")

        // First receive succeeds.
        bobState.receive(envelope.ratchetCounter) {
            PSKCrypto.decryptMessage(envelope, bob.privateKey, bob.publicKey, psk)
        }

        // Replay of the same envelope/counter is rejected before decryption.
        assertThrows<AlgoChatException.DecryptionFailed> {
            bobState.receive(envelope.ratchetCounter) {
                PSKCrypto.decryptMessage(envelope, bob.privateKey, bob.publicKey, psk)
            }
        }
    }

    @Test
    fun `PSK receive does not consume counter on decryption failure`() = runTest {
        val alice = aliceKeys()
        val bob = bobKeys()
        val counter = 4u
        val correctPSK = PSKRatchet.derivePSKAtCounter(TEST_PSK, counter)
        val wrongPSK = PSKRatchet.derivePSKAtCounter(TEST_PSK, counter + 1u)

        val envelope = PSKCrypto.encryptMessage(
            "Secret", alice.privateKey, alice.publicKey, bob.publicKey, correctPSK, counter
        )

        val bobState = PSKState(TEST_PSK, "alice")

        // Decryption fails with the wrong PSK; the counter must not be consumed.
        assertThrows<Exception> {
            bobState.receive(envelope.ratchetCounter) {
                PSKCrypto.decryptMessage(envelope, bob.privateKey, bob.publicKey, wrongPSK)
            }
        }

        // Counter is still available, so a valid receive at the same counter works.
        val decrypted = bobState.receive(envelope.ratchetCounter) {
            PSKCrypto.decryptMessage(envelope, bob.privateKey, bob.publicKey, correctPSK)
        }
        assertNotNull(decrypted)
    }

    @Test
    fun `PSK state derives correct PSK at counter`() {
        val state = PSKState(TEST_PSK, "test-peer")

        val psk0 = state.pskAtCounter(0u)
        val expected0 = PSKRatchet.derivePSKAtCounter(TEST_PSK, 0u)
        assertTrue(psk0.contentEquals(expected0))

        val psk100 = state.pskAtCounter(100u)
        val expected100 = PSKRatchet.derivePSKAtCounter(TEST_PSK, 100u)
        assertTrue(psk100.contentEquals(expected100))
    }

    // ========================================================================
    // PSK Exchange URI Tests
    // ========================================================================

    @Test
    fun `PSK exchange URI encode decode roundtrip`() {
        val uri = PSKExchangeURI(
            address = "TESTADDR1234567890ABCDEF",
            psk = TEST_PSK,
            label = "My Chat"
        )

        val encoded = uri.encode()
        assertTrue(encoded.startsWith("algochat-psk://v1?"))
        assertTrue(encoded.contains("addr="))
        assertTrue(encoded.contains("psk="))
        assertTrue(encoded.contains("label="))

        val decoded = PSKExchangeURI.decode(encoded)
        assertEquals(uri.address, decoded.address)
        assertTrue(uri.psk.contentEquals(decoded.psk))
        assertEquals(uri.label, decoded.label)
    }

    @Test
    fun `PSK exchange URI without label`() {
        val uri = PSKExchangeURI(
            address = "TESTADDR",
            psk = TEST_PSK
        )

        val encoded = uri.encode()
        assertFalse(encoded.contains("label="))

        val decoded = PSKExchangeURI.decode(encoded)
        assertEquals(uri.address, decoded.address)
        assertTrue(uri.psk.contentEquals(decoded.psk))
        assertEquals(null, decoded.label)
    }

    @Test
    fun `PSK exchange URI invalid scheme throws`() {
        assertThrows<AlgoChatException> {
            PSKExchangeURI.decode("https://example.com")
        }
    }

    @Test
    fun `PSK exchange URI missing addr throws`() {
        assertThrows<AlgoChatException> {
            PSKExchangeURI.decode("algochat-psk://v1?psk=AAAA")
        }
    }

    @Test
    fun `PSK exchange URI missing psk throws`() {
        assertThrows<AlgoChatException> {
            PSKExchangeURI.decode("algochat-psk://v1?addr=TEST")
        }
    }

    @Test
    fun `PSK exchange URI invalid psk size throws`() {
        // Base64url encode 16 bytes (wrong size)
        val shortPsk = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(ByteArray(16))
        assertThrows<AlgoChatException> {
            PSKExchangeURI.decode("algochat-psk://v1?addr=TEST&psk=$shortPsk")
        }
    }
}
