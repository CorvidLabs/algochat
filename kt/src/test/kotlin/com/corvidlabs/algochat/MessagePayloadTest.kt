package com.corvidlabs.algochat

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

// ============================================================================
// MessagePayloadCodec Tests
// ============================================================================

class MessagePayloadCodecTest {

    @Test
    fun `encode plain text produces valid JSON`() {
        val bytes = MessagePayloadCodec.encode("Hello")
        val json = String(bytes, Charsets.UTF_8)
        assertTrue(json.contains("\"text\""))
        assertTrue(json.contains("Hello"))
    }

    @Test
    fun `encode with reply context includes replyTo`() {
        val bytes = MessagePayloadCodec.encode("Reply text", "tx123", "original preview")
        val json = String(bytes, Charsets.UTF_8)
        assertTrue(json.contains("\"replyTo\""))
        assertTrue(json.contains("\"txid\""))
        assertTrue(json.contains("tx123"))
        assertTrue(json.contains("original preview"))
    }

    @Test
    fun `encode without reply context omits replyTo`() {
        val bytes = MessagePayloadCodec.encode("Plain message")
        val json = String(bytes, Charsets.UTF_8)
        assertTrue(!json.contains("replyTo"))
    }

    @Test
    fun `decode plain text`() {
        val content = MessagePayloadCodec.decode("Hello World".toByteArray())
        assertEquals("Hello World", content.text)
        assertNull(content.replyToId)
        assertNull(content.replyToPreview)
    }

    @Test
    fun `decode structured JSON with text only`() {
        val json = """{"text":"Hello structured"}"""
        val content = MessagePayloadCodec.decode(json.toByteArray())
        assertEquals("Hello structured", content.text)
        assertNull(content.replyToId)
    }

    @Test
    fun `decode structured JSON with reply context`() {
        val json = """{"text":"Reply msg","replyTo":{"txid":"abc123","preview":"original"}}"""
        val content = MessagePayloadCodec.decode(json.toByteArray())
        assertEquals("Reply msg", content.text)
        assertEquals("abc123", content.replyToId)
        assertEquals("original", content.replyToPreview)
    }

    @Test
    fun `decode ignores unknown JSON fields`() {
        val json = """{"text":"Hello","unknown":"value","extra":42}"""
        val content = MessagePayloadCodec.decode(json.toByteArray())
        assertEquals("Hello", content.text)
    }

    @Test
    fun `decode falls back to plain text for invalid JSON`() {
        val content = MessagePayloadCodec.decode("{not valid json".toByteArray())
        assertEquals("{not valid json", content.text)
    }

    @Test
    fun `decode handles escaped characters in text`() {
        val json = """{"text":"Line 1\nLine 2\tTabbed \"quoted\""}"""
        val content = MessagePayloadCodec.decode(json.toByteArray())
        assertEquals("Line 1\nLine 2\tTabbed \"quoted\"", content.text)
    }

    @Test
    fun `decode handles Unicode in text`() {
        val json = """{"text":"Hello 👋 World 🌍 你好"}"""
        val content = MessagePayloadCodec.decode(json.toByteArray())
        assertEquals("Hello 👋 World 🌍 你好", content.text)
    }

    @Test
    fun `decode handles empty text`() {
        val json = """{"text":""}"""
        val content = MessagePayloadCodec.decode(json.toByteArray())
        assertEquals("", content.text)
    }

    @Test
    fun `encode decode roundtrip preserves text`() {
        val original = "Hello with special chars: \"quotes\", \nnewlines, \ttabs, \\ backslash"
        val encoded = MessagePayloadCodec.encode(original)
        val decoded = MessagePayloadCodec.decode(encoded)
        assertEquals(original, decoded.text)
    }

    @Test
    fun `encode decode roundtrip preserves reply context`() {
        val encoded = MessagePayloadCodec.encode("Reply", "tx-abc", "Preview text")
        val decoded = MessagePayloadCodec.decode(encoded)
        assertEquals("Reply", decoded.text)
        assertEquals("tx-abc", decoded.replyToId)
        assertEquals("Preview text", decoded.replyToPreview)
    }

    @Test
    fun `encode decode roundtrip with emoji`() {
        val text = "Family: 👨‍👩‍👧‍👦 Flag: 🇯🇵"
        val encoded = MessagePayloadCodec.encode(text)
        val decoded = MessagePayloadCodec.decode(encoded)
        assertEquals(text, decoded.text)
    }

    @Test
    fun `isKeyPublish detects key-publish payloads`() {
        val payload = """{"type":"key-publish","key":"abc"}""".toByteArray()
        assertTrue(MessagePayloadCodec.isKeyPublish(payload))
    }

    @Test
    fun `isKeyPublish returns false for regular messages`() {
        val payload = """{"text":"Hello"}""".toByteArray()
        assertTrue(!MessagePayloadCodec.isKeyPublish(payload))
    }

    @Test
    fun `isKeyPublish returns false for empty data`() {
        assertTrue(!MessagePayloadCodec.isKeyPublish(byteArrayOf()))
    }

    @Test
    fun `isKeyPublish returns false for non-JSON data`() {
        assertTrue(!MessagePayloadCodec.isKeyPublish("plain text".toByteArray()))
    }

    @Test
    fun `decode replyTo with null preview`() {
        val json = """{"text":"Reply","replyTo":{"txid":"tx1"}}"""
        val content = MessagePayloadCodec.decode(json.toByteArray())
        assertEquals("Reply", content.text)
        assertEquals("tx1", content.replyToId)
        assertNull(content.replyToPreview)
    }
}

// ============================================================================
// Crypto encryptReply Tests
// ============================================================================

class EncryptReplyTest {

    companion object {
        fun hexToBytes(hex: String) = AlgoChatTest.hexToBytes(hex)
        fun aliceKeys() = AlgoChatTest.aliceKeys()
        fun bobKeys() = AlgoChatTest.bobKeys()
    }

    @Test
    fun `encryptReply creates envelope with reply context`() {
        val alice = aliceKeys()
        val bob = bobKeys()

        val envelope = Crypto.encryptReply(
            text = "This is my reply",
            replyToTxid = "ORIGINAL_TX_ID",
            replyToPreview = "Original message preview",
            senderPrivateKey = alice.privateKey,
            senderPublicKey = alice.publicKey,
            recipientPublicKey = bob.publicKey
        )

        val decrypted = Crypto.decryptMessage(envelope, bob.privateKey, bob.publicKey)

        assertEquals("This is my reply", decrypted!!.text)
        assertEquals("ORIGINAL_TX_ID", decrypted.replyToId)
        assertEquals("Original message preview", decrypted.replyToPreview)
    }

    @Test
    fun `encryptReply works without preview`() {
        val alice = aliceKeys()
        val bob = bobKeys()

        val envelope = Crypto.encryptReply(
            text = "Reply without preview",
            replyToTxid = "TX_ID_123",
            senderPrivateKey = alice.privateKey,
            senderPublicKey = alice.publicKey,
            recipientPublicKey = bob.publicKey
        )

        val decrypted = Crypto.decryptMessage(envelope, bob.privateKey, bob.publicKey)

        assertEquals("Reply without preview", decrypted!!.text)
        assertEquals("TX_ID_123", decrypted.replyToId)
        assertNull(decrypted.replyToPreview)
    }

    @Test
    fun `encryptReply sender can decrypt own reply`() {
        val alice = aliceKeys()
        val bob = bobKeys()

        val envelope = Crypto.encryptReply(
            text = "My own reply",
            replyToTxid = "TX_REF",
            replyToPreview = "Preview",
            senderPrivateKey = alice.privateKey,
            senderPublicKey = alice.publicKey,
            recipientPublicKey = bob.publicKey
        )

        val decrypted = Crypto.decryptMessage(envelope, alice.privateKey, alice.publicKey)

        assertEquals("My own reply", decrypted!!.text)
        assertEquals("TX_REF", decrypted.replyToId)
    }

    @Test
    fun `encryptReply with special characters in text and preview`() {
        val alice = aliceKeys()
        val bob = bobKeys()

        val envelope = Crypto.encryptReply(
            text = "Reply with \"quotes\" and\nnewlines",
            replyToTxid = "TX_SPECIAL",
            replyToPreview = "Original with 👋 emoji",
            senderPrivateKey = alice.privateKey,
            senderPublicKey = alice.publicKey,
            recipientPublicKey = bob.publicKey
        )

        val decrypted = Crypto.decryptMessage(envelope, bob.privateKey, bob.publicKey)

        assertEquals("Reply with \"quotes\" and\nnewlines", decrypted!!.text)
        assertEquals("TX_SPECIAL", decrypted.replyToId)
        assertEquals("Original with 👋 emoji", decrypted.replyToPreview)
    }

    @Test
    fun `PSK encryptReply creates envelope with reply context`() {
        val alice = aliceKeys()
        val bob = bobKeys()
        val initialPsk = ByteArray(32) { it.toByte() }
        val derivedPsk = PSKRatchet.derivePSKAtCounter(initialPsk, 0u)

        val envelope = PSKCrypto.encryptReply(
            text = "PSK reply",
            replyToTxid = "PSK_TX_ID",
            replyToPreview = "PSK original",
            senderPrivateKey = alice.privateKey,
            senderPublicKey = alice.publicKey,
            recipientPublicKey = bob.publicKey,
            currentPSK = derivedPsk,
            ratchetCounter = 0u
        )

        val decrypted = PSKCrypto.decryptMessage(envelope, bob.privateKey, bob.publicKey, derivedPsk)

        assertEquals("PSK reply", decrypted!!.text)
        assertEquals("PSK_TX_ID", decrypted.replyToId)
        assertEquals("PSK original", decrypted.replyToPreview)
    }

    @Test
    fun `PSK encryptReply sender can decrypt own reply`() {
        val alice = aliceKeys()
        val bob = bobKeys()
        val initialPsk = ByteArray(32) { (it + 10).toByte() }
        val derivedPsk = PSKRatchet.derivePSKAtCounter(initialPsk, 5u)

        val envelope = PSKCrypto.encryptReply(
            text = "Self-read PSK reply",
            replyToTxid = "SELF_TX",
            senderPrivateKey = alice.privateKey,
            senderPublicKey = alice.publicKey,
            recipientPublicKey = bob.publicKey,
            currentPSK = derivedPsk,
            ratchetCounter = 5u
        )

        val decrypted = PSKCrypto.decryptMessage(envelope, alice.privateKey, alice.publicKey, derivedPsk)

        assertEquals("Self-read PSK reply", decrypted!!.text)
        assertEquals("SELF_TX", decrypted.replyToId)
    }
}

// ============================================================================
// Conversation enrichment tests
// ============================================================================

class ConversationEnrichmentTest {

    private fun makeMessage(
        id: String,
        direction: MessageDirection = MessageDirection.SENT,
        timestamp: java.time.Instant = java.time.Instant.ofEpochSecond(1700000000),
        confirmedRound: Long = 100
    ) = Message(
        id = id,
        sender = if (direction == MessageDirection.SENT) "ALICE" else "BOB",
        recipient = if (direction == MessageDirection.SENT) "BOB" else "ALICE",
        content = "msg-$id",
        timestamp = timestamp,
        confirmedRound = confirmedRound,
        direction = direction
    )

    @Test
    fun `hasMessage returns true for existing message`() {
        val conv = Conversation("BOB")
        conv.append(makeMessage("tx1"))
        assertTrue(conv.hasMessage("tx1"))
    }

    @Test
    fun `hasMessage returns false for missing message`() {
        val conv = Conversation("BOB")
        conv.append(makeMessage("tx1"))
        assertTrue(!conv.hasMessage("tx-unknown"))
    }

    @Test
    fun `getById returns message when found`() {
        val conv = Conversation("BOB")
        conv.append(makeMessage("tx1"))
        conv.append(makeMessage("tx2"))

        val found = conv.getById("tx1")
        assertEquals("tx1", found!!.id)
    }

    @Test
    fun `getById returns null when not found`() {
        val conv = Conversation("BOB")
        conv.append(makeMessage("tx1"))

        assertNull(conv.getById("tx-missing"))
    }

    @Test
    fun `messagesAfterRound filters correctly`() {
        val conv = Conversation("BOB")
        conv.append(makeMessage("tx1", confirmedRound = 100))
        conv.append(makeMessage("tx2", confirmedRound = 200))
        conv.append(makeMessage("tx3", confirmedRound = 300))

        val after150 = conv.messagesAfterRound(150)
        assertEquals(2, after150.size)
        assertEquals("tx2", after150[0].id)
        assertEquals("tx3", after150[1].id)
    }

    @Test
    fun `messagesAfterRound with exact boundary excludes equal round`() {
        val conv = Conversation("BOB")
        conv.append(makeMessage("tx1", confirmedRound = 100))
        conv.append(makeMessage("tx2", confirmedRound = 200))

        val afterExact = conv.messagesAfterRound(100)
        assertEquals(1, afterExact.size)
        assertEquals("tx2", afterExact[0].id)
    }

    @Test
    fun `messagesAfterRound returns empty when no matches`() {
        val conv = Conversation("BOB")
        conv.append(makeMessage("tx1", confirmedRound = 100))

        assertTrue(conv.messagesAfterRound(200).isEmpty())
    }

    @Test
    fun `messagesInDirection filters by SENT`() {
        val conv = Conversation("BOB")
        conv.append(makeMessage("s1", MessageDirection.SENT, java.time.Instant.ofEpochSecond(1)))
        conv.append(makeMessage("r1", MessageDirection.RECEIVED, java.time.Instant.ofEpochSecond(2)))
        conv.append(makeMessage("s2", MessageDirection.SENT, java.time.Instant.ofEpochSecond(3)))

        val sent = conv.messagesInDirection(MessageDirection.SENT)
        assertEquals(2, sent.size)
        assertTrue(sent.all { it.direction == MessageDirection.SENT })
    }

    @Test
    fun `messagesInDirection filters by RECEIVED`() {
        val conv = Conversation("BOB")
        conv.append(makeMessage("s1", MessageDirection.SENT, java.time.Instant.ofEpochSecond(1)))
        conv.append(makeMessage("r1", MessageDirection.RECEIVED, java.time.Instant.ofEpochSecond(2)))

        val received = conv.messagesInDirection(MessageDirection.RECEIVED)
        assertEquals(1, received.size)
        assertEquals("r1", received[0].id)
    }

    @Test
    fun `highestRound returns max round`() {
        val conv = Conversation("BOB")
        conv.append(makeMessage("tx1", confirmedRound = 100))
        conv.append(makeMessage("tx2", confirmedRound = 500))
        conv.append(makeMessage("tx3", confirmedRound = 300))

        assertEquals(500L, conv.highestRound())
    }

    @Test
    fun `highestRound returns null for empty conversation`() {
        val conv = Conversation("BOB")
        assertNull(conv.highestRound())
    }

    @Test
    fun `clear removes all messages`() {
        val conv = Conversation("BOB")
        conv.append(makeMessage("tx1"))
        conv.append(makeMessage("tx2"))
        conv.append(makeMessage("tx3"))

        assertEquals(3, conv.messageCount)
        conv.clear()
        assertEquals(0, conv.messageCount)
        assertTrue(conv.isEmpty)
        assertNull(conv.lastMessage)
    }

    @Test
    fun `clear allows re-adding messages`() {
        val conv = Conversation("BOB")
        conv.append(makeMessage("tx1"))
        conv.clear()

        conv.append(makeMessage("tx2"))
        assertEquals(1, conv.messageCount)
        assertEquals("tx2", conv.messages[0].id)
    }
}

// ============================================================================
// Message enrichment tests (amount, fee, intraRoundOffset)
// ============================================================================

class MessageEnrichmentTest {

    @Test
    fun `message defaults have zero amount, fee, and offset`() {
        val msg = Message(
            id = "tx1",
            sender = "ALICE",
            recipient = "BOB",
            content = "hello",
            timestamp = java.time.Instant.ofEpochSecond(1700000000),
            confirmedRound = 100,
            direction = MessageDirection.SENT
        )

        assertEquals(0L, msg.amount)
        assertEquals(0L, msg.fee)
        assertEquals(0, msg.intraRoundOffset)
    }

    @Test
    fun `message with payment amount`() {
        val msg = Message(
            id = "tx1",
            sender = "ALICE",
            recipient = "BOB",
            content = "Payment message",
            timestamp = java.time.Instant.ofEpochSecond(1700000000),
            confirmedRound = 100,
            direction = MessageDirection.SENT,
            amount = 5_000_000,
            fee = 1000
        )

        assertEquals(5_000_000L, msg.amount)
        assertEquals(1000L, msg.fee)
    }

    @Test
    fun `message with intra-round offset for ordering`() {
        val msg1 = Message(
            id = "tx1",
            sender = "ALICE",
            recipient = "BOB",
            content = "First",
            timestamp = java.time.Instant.ofEpochSecond(1700000000),
            confirmedRound = 100,
            direction = MessageDirection.SENT,
            intraRoundOffset = 0
        )
        val msg2 = Message(
            id = "tx2",
            sender = "ALICE",
            recipient = "BOB",
            content = "Second",
            timestamp = java.time.Instant.ofEpochSecond(1700000000),
            confirmedRound = 100,
            direction = MessageDirection.SENT,
            intraRoundOffset = 1
        )

        assertTrue(msg1.intraRoundOffset < msg2.intraRoundOffset)
    }

    @Test
    fun `equals still based on id only (ignores amount, fee)`() {
        val msg1 = Message(
            id = "tx1", sender = "A", recipient = "B", content = "hello",
            timestamp = java.time.Instant.ofEpochSecond(1), confirmedRound = 1,
            direction = MessageDirection.SENT, amount = 100, fee = 10
        )
        val msg2 = Message(
            id = "tx1", sender = "A", recipient = "B", content = "hello",
            timestamp = java.time.Instant.ofEpochSecond(1), confirmedRound = 1,
            direction = MessageDirection.SENT, amount = 999, fee = 999
        )
        assertEquals(msg1, msg2)
    }
}

// ============================================================================
// DiscoveredKey enrichment tests
// ============================================================================

class DiscoveredKeyEnrichmentTest {

    @Test
    fun `discoveredKey with provenance metadata`() {
        val key = DiscoveredKey(
            publicKey = ByteArray(32) { 1 },
            isVerified = true,
            address = "ALICE_ADDR",
            discoveredInTx = "TX_ABC",
            discoveredAtRound = 42000L,
            discoveredAt = java.time.Instant.ofEpochSecond(1700000000)
        )

        assertEquals("ALICE_ADDR", key.address)
        assertEquals("TX_ABC", key.discoveredInTx)
        assertEquals(42000L, key.discoveredAtRound)
        assertEquals(java.time.Instant.ofEpochSecond(1700000000), key.discoveredAt)
    }

    @Test
    fun `discoveredKey defaults have null provenance`() {
        val key = DiscoveredKey(ByteArray(32) { 1 }, isVerified = true)

        assertNull(key.address)
        assertNull(key.discoveredInTx)
        assertNull(key.discoveredAtRound)
        assertNull(key.discoveredAt)
    }

    @Test
    fun `equals includes provenance fields`() {
        val key1 = DiscoveredKey(ByteArray(32) { 1 }, true, "ADDR", "TX1", 100L, null)
        val key2 = DiscoveredKey(ByteArray(32) { 1 }, true, "ADDR", "TX1", 100L, null)
        val key3 = DiscoveredKey(ByteArray(32) { 1 }, true, "ADDR", "TX2", 100L, null)

        assertEquals(key1, key2)
        assertTrue(key1 != key3)
    }

    @Test
    fun `hashCode includes provenance fields`() {
        val key1 = DiscoveredKey(ByteArray(32) { 1 }, true, "ADDR", "TX1", 100L, null)
        val key2 = DiscoveredKey(ByteArray(32) { 1 }, true, "ADDR", "TX1", 100L, null)
        assertEquals(key1.hashCode(), key2.hashCode())
    }
}

// ============================================================================
// SendOptions enrichment tests
// ============================================================================

class SendOptionsEnrichmentTest {

    @Test
    fun `sendOptions default has null customAmount`() {
        val opts = SendOptions.fireAndForget()
        assertNull(opts.customAmount)
    }

    @Test
    fun `sendOptions with customAmount`() {
        val opts = SendOptions(customAmount = 5_000_000)
        assertEquals(5_000_000L, opts.customAmount)
    }

    @Test
    fun `copy preserves customAmount`() {
        val opts = SendOptions(customAmount = 1_000_000, waitForConfirmation = true)
        val copied = opts.copy(waitForIndexer = true)
        assertEquals(1_000_000L, copied.customAmount)
        assertTrue(copied.waitForConfirmation)
        assertTrue(copied.waitForIndexer)
    }
}

// ============================================================================
// PSK key-publish null return fix test
// ============================================================================

class PSKKeyPublishTest {

    @Test
    fun `PSK decryptMessage returns null for key-publish payload`() {
        val alice = AlgoChatTest.aliceKeys()
        val bob = AlgoChatTest.bobKeys()
        val psk = ByteArray(32) { it.toByte() }
        val ratchetPsk = PSKRatchet.derivePSKAtCounter(psk, 0u)

        // Encrypt a key-publish payload
        val keyPublishJson = """{"type":"key-publish","key":"test-key-data"}"""
        val envelope = PSKCrypto.encryptMessage(
            keyPublishJson,
            alice.privateKey,
            alice.publicKey,
            bob.publicKey,
            ratchetPsk,
            0u
        )

        // Should return null for key-publish messages
        val decrypted = PSKCrypto.decryptMessage(envelope, bob.privateKey, bob.publicKey, ratchetPsk)
        assertNull(decrypted)
    }
}

// ============================================================================
// End-to-end conversation simulation
// ============================================================================

class EndToEndSimulationTest {

    @Test
    fun `full conversation lifecycle with replies`() {
        val alice = AlgoChatTest.aliceKeys()
        val bob = AlgoChatTest.bobKeys()

        // Alice sends first message
        val msg1Envelope = Crypto.encryptMessage(
            "Hello Bob!",
            alice.privateKey, alice.publicKey, bob.publicKey
        )

        // Bob decrypts
        val msg1 = Crypto.decryptMessage(msg1Envelope, bob.privateKey, bob.publicKey)
        assertEquals("Hello Bob!", msg1!!.text)

        // Bob replies using encryptReply
        val replyEnvelope = Crypto.encryptReply(
            text = "Hi Alice! How are you?",
            replyToTxid = "TX_MSG1",
            replyToPreview = "Hello Bob!",
            senderPrivateKey = bob.privateKey,
            senderPublicKey = bob.publicKey,
            recipientPublicKey = alice.publicKey
        )

        // Alice decrypts the reply
        val reply = Crypto.decryptMessage(replyEnvelope, alice.privateKey, alice.publicKey)
        assertEquals("Hi Alice! How are you?", reply!!.text)
        assertEquals("TX_MSG1", reply.replyToId)
        assertEquals("Hello Bob!", reply.replyToPreview)

        // Bob also reads his own reply (bidirectional)
        val selfRead = Crypto.decryptMessage(replyEnvelope, bob.privateKey, bob.publicKey)
        assertEquals("Hi Alice! How are you?", selfRead!!.text)
        assertEquals("TX_MSG1", selfRead.replyToId)
    }

    @Test
    fun `conversation model tracks multi-message exchange`() {
        val conv = Conversation("BOB")

        // Simulate 5 messages
        for (i in 1..5) {
            val dir = if (i % 2 == 1) MessageDirection.SENT else MessageDirection.RECEIVED
            conv.append(Message(
                id = "tx$i",
                sender = if (dir == MessageDirection.SENT) "ALICE" else "BOB",
                recipient = if (dir == MessageDirection.SENT) "BOB" else "ALICE",
                content = "Message $i",
                timestamp = java.time.Instant.ofEpochSecond(1700000000L + i * 60),
                confirmedRound = 100L + i,
                direction = dir
            ))
        }

        assertEquals(5, conv.messageCount)
        assertEquals(3, conv.sentMessages.size)
        assertEquals(2, conv.receivedMessages.size)
        assertEquals("tx5", conv.lastMessage!!.id)
        assertEquals(105L, conv.highestRound())

        // Query methods
        assertTrue(conv.hasMessage("tx3"))
        assertEquals("Message 3", conv.getById("tx3")!!.content)

        val afterRound102 = conv.messagesAfterRound(102)
        assertEquals(3, afterRound102.size)

        // Clear and verify
        conv.clear()
        assertTrue(conv.isEmpty)
        assertNull(conv.highestRound())
    }

    @Test
    fun `PSK full conversation with counter progression`() {
        val alice = AlgoChatTest.aliceKeys()
        val bob = AlgoChatTest.bobKeys()
        val initialPSK = ByteArray(32) { (it * 7).toByte() }

        // Send 3 messages with incrementing counters
        for (counter in 0u..2u) {
            val psk = PSKRatchet.derivePSKAtCounter(initialPSK, counter)

            val envelope = PSKCrypto.encryptMessage(
                "Message #$counter",
                alice.privateKey, alice.publicKey, bob.publicKey,
                psk, counter
            )

            val decrypted = PSKCrypto.decryptMessage(
                envelope, bob.privateKey, bob.publicKey, psk
            )

            assertEquals("Message #$counter", decrypted!!.text)
        }
    }
}
