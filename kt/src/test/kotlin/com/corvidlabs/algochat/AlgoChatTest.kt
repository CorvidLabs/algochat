package com.corvidlabs.algochat

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class AlgoChatTest {
    companion object {
        const val ALICE_SEED_HEX = "0000000000000000000000000000000000000000000000000000000000000001"
        const val BOB_SEED_HEX = "0000000000000000000000000000000000000000000000000000000000000002"
        const val ALICE_PUBLIC_KEY_HEX = "a04407c78ff19a0bbd578588d6100bca4ed7f89acfc600666dbab1d36061c064"
        const val BOB_PUBLIC_KEY_HEX = "b43231dc85ba0781ad3df9b8f8458a5e6f4c1030d0526ace9540300e0398ae03"

        val TEST_MESSAGES = mapOf(
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
            "max_payload" to "A".repeat(Protocol.MAX_PAYLOAD_SIZE)
        )

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

    @Test
    fun `derive Alice keys`() {
        val keyPair = aliceKeys()
        val publicKeyHex = bytesToHex(Keys.publicKeyToBytes(keyPair.publicKey))
        assertEquals(ALICE_PUBLIC_KEY_HEX, publicKeyHex)
    }

    @Test
    fun `derive Bob keys`() {
        val keyPair = bobKeys()
        val publicKeyHex = bytesToHex(Keys.publicKeyToBytes(keyPair.publicKey))
        assertEquals(BOB_PUBLIC_KEY_HEX, publicKeyHex)
    }

    @Test
    fun `invalid seed length throws`() {
        assertThrows<AlgoChatException> {
            Keys.deriveKeysFromSeed(byteArrayOf(1, 2, 3))
        }
    }

    @Test
    fun `deterministic key derivation`() {
        val keys1 = aliceKeys()
        val keys2 = aliceKeys()
        assertTrue(Keys.publicKeyToBytes(keys1.publicKey).contentEquals(Keys.publicKeyToBytes(keys2.publicKey)))
    }

    @Test
    fun `encrypt decrypt roundtrip`() {
        val alice = aliceKeys()
        val bob = bobKeys()
        val message = "Hello from Kotlin!"

        val envelope = Crypto.encryptMessage(
            message,
            alice.privateKey,
            alice.publicKey,
            bob.publicKey
        )

        val decrypted = Crypto.decryptMessage(envelope, bob.privateKey, bob.publicKey)

        assertNotNull(decrypted)
        assertEquals(message, decrypted.text)
    }

    @Test
    fun `sender can decrypt own message`() {
        val alice = aliceKeys()
        val bob = bobKeys()
        val message = "I sent this!"

        val envelope = Crypto.encryptMessage(
            message,
            alice.privateKey,
            alice.publicKey,
            bob.publicKey
        )

        val decrypted = Crypto.decryptMessage(envelope, alice.privateKey, alice.publicKey)

        assertNotNull(decrypted)
        assertEquals(message, decrypted.text)
    }

    @Test
    fun `envelope encode decode roundtrip`() {
        val alice = aliceKeys()
        val bob = bobKeys()

        val envelope = Crypto.encryptMessage(
            "Test message",
            alice.privateKey,
            alice.publicKey,
            bob.publicKey
        )

        val encoded = envelope.encode()
        assertTrue(encoded.size >= Protocol.HEADER_SIZE)
        assertTrue(isChatMessage(encoded))

        val decoded = ChatEnvelope.decode(encoded)
        assertEquals(envelope, decoded)
    }

    @Test
    fun `all message types encrypt decrypt correctly`() {
        val alice = aliceKeys()
        val bob = bobKeys()

        for ((key, message) in TEST_MESSAGES) {
            val envelope = Crypto.encryptMessage(
                message,
                alice.privateKey,
                alice.publicKey,
                bob.publicKey
            )

            // Decrypt as recipient
            val decryptedBob = Crypto.decryptMessage(envelope, bob.privateKey, bob.publicKey)
            assertNotNull(decryptedBob, "Failed to decrypt $key as recipient")
            assertEquals(message, decryptedBob.text, "Message mismatch for $key")

            // Decrypt as sender
            val decryptedAlice = Crypto.decryptMessage(envelope, alice.privateKey, alice.publicKey)
            assertNotNull(decryptedAlice, "Failed to decrypt $key as sender")
            assertEquals(message, decryptedAlice.text, "Bidirectional mismatch for $key")
        }
    }

    @Test
    fun `message too large throws`() {
        val alice = aliceKeys()
        val bob = bobKeys()
        val message = "A".repeat(Protocol.MAX_PAYLOAD_SIZE + 1)

        assertThrows<AlgoChatException> {
            Crypto.encryptMessage(
                message,
                alice.privateKey,
                alice.publicKey,
                bob.publicKey
            )
        }
    }

    @Test
    fun `note ceiling keeps the header and tag and raises plaintext to 3954`() {
        assertEquals(126, Protocol.HEADER_SIZE)
        assertEquals(16, Protocol.TAG_SIZE)
        assertEquals(4096, Protocol.MAX_NOTE_SIZE)
        assertEquals(3954, Protocol.MAX_PAYLOAD_SIZE)
    }

    @Test
    fun `legacy 882 byte plaintext still encrypts within 1024 bytes`() {
        val alice = aliceKeys()
        val bob = bobKeys()
        val message = "A".repeat(882)

        val envelope = Crypto.encryptMessage(
            message,
            alice.privateKey,
            alice.publicKey,
            bob.publicKey
        )
        val encoded = envelope.encode()

        assertTrue(encoded.size <= 1024)
        val decrypted = Crypto.decryptMessage(envelope, bob.privateKey, bob.publicKey)
        assertNotNull(decrypted)
        assertEquals(message, decrypted.text)
    }

    @Test
    fun `maximum plaintext encodes to a 4096 byte note`() {
        val alice = aliceKeys()
        val bob = bobKeys()
        val message = "A".repeat(Protocol.MAX_PAYLOAD_SIZE)

        val encoded = Crypto.encryptMessage(
            message,
            alice.privateKey,
            alice.publicKey,
            bob.publicKey
        ).encode()

        assertEquals(4096, encoded.size)
    }

    @Test
    fun `one byte past the maximum fails before an envelope is built`() {
        val alice = aliceKeys()
        val bob = bobKeys()
        val message = "A".repeat(Protocol.MAX_PAYLOAD_SIZE + 1)

        assertThrows<AlgoChatException.EncryptionFailed> {
            Crypto.encryptMessage(
                message,
                alice.privateKey,
                alice.publicKey,
                bob.publicKey
            )
        }
    }

    @Test
    fun `note fee at minFee 1000`() {
        assertEquals(1000L, Protocol.paymentFee(1024, 1000L))
        assertEquals(1098L, Protocol.paymentFee(2000, 1000L))
        assertEquals(1308L, Protocol.paymentFee(4096, 1000L))
    }

    @Test
    fun `is chat message detection`() {
        val validHeader = byteArrayOf(Protocol.VERSION, Protocol.PROTOCOL_ID) + ByteArray(Protocol.HEADER_SIZE - 2)
        assertTrue(isChatMessage(validHeader))
        assertTrue(!isChatMessage(byteArrayOf(0x00, 0x01)))
        assertTrue(!isChatMessage(byteArrayOf(0x01, 0x00)))
        assertTrue(!isChatMessage(byteArrayOf()))
    }
}
