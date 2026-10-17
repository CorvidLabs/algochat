package com.corvidlabs.algochat

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.Instant
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

// ============================================================================
// ReplyContext Tests
// ============================================================================

class ReplyContextTest {

    @Test
    fun `fromMessage creates reply context with short content`() {
        val msg = Message(
            id = "tx1",
            sender = "ALICE",
            recipient = "BOB",
            content = "Hello!",
            timestamp = Instant.ofEpochSecond(1700000000),
            confirmedRound = 100,
            direction = MessageDirection.SENT
        )

        val reply = ReplyContext.fromMessage(msg)
        assertEquals("tx1", reply.messageId)
        assertEquals("Hello!", reply.preview)
    }

    @Test
    fun `fromMessage truncates long content`() {
        val longContent = "A".repeat(200)
        val msg = Message(
            id = "tx1",
            sender = "ALICE",
            recipient = "BOB",
            content = longContent,
            timestamp = Instant.ofEpochSecond(1700000000),
            confirmedRound = 100,
            direction = MessageDirection.SENT
        )

        val reply = ReplyContext.fromMessage(msg)
        assertEquals(80, reply.preview.length)
        assertTrue(reply.preview.endsWith("..."))
    }

    @Test
    fun `fromMessage uses custom maxLength`() {
        val msg = Message(
            id = "tx1",
            sender = "ALICE",
            recipient = "BOB",
            content = "A".repeat(100),
            timestamp = Instant.ofEpochSecond(1700000000),
            confirmedRound = 100,
            direction = MessageDirection.SENT
        )

        val reply = ReplyContext.fromMessage(msg, maxLength = 20)
        assertEquals(20, reply.preview.length)
        assertTrue(reply.preview.endsWith("..."))
    }

    @Test
    fun `fromMessage exact maxLength does not truncate`() {
        val msg = Message(
            id = "tx1",
            sender = "ALICE",
            recipient = "BOB",
            content = "A".repeat(80),
            timestamp = Instant.ofEpochSecond(1700000000),
            confirmedRound = 100,
            direction = MessageDirection.SENT
        )

        val reply = ReplyContext.fromMessage(msg)
        assertEquals(80, reply.preview.length)
        assertFalse(reply.preview.endsWith("..."))
    }
}

// ============================================================================
// Message Tests
// ============================================================================

class MessageTest {

    private fun makeMessage(
        id: String = "tx1",
        replyContext: ReplyContext? = null
    ) = Message(
        id = id,
        sender = "ALICE",
        recipient = "BOB",
        content = "hello",
        timestamp = Instant.ofEpochSecond(1700000000),
        confirmedRound = 100,
        direction = MessageDirection.SENT,
        replyContext = replyContext
    )

    @Test
    fun `isReply returns false when no reply context`() {
        val msg = makeMessage()
        assertFalse(msg.isReply)
    }

    @Test
    fun `isReply returns true when reply context present`() {
        val msg = makeMessage(replyContext = ReplyContext("parent-tx", "parent content"))
        assertTrue(msg.isReply)
    }

    @Test
    fun `equals is based on id only`() {
        val msg1 = makeMessage(id = "tx1")
        val msg2 = Message(
            id = "tx1",
            sender = "DIFFERENT",
            recipient = "DIFFERENT",
            content = "different",
            timestamp = Instant.ofEpochSecond(9999999999),
            confirmedRound = 999,
            direction = MessageDirection.RECEIVED
        )

        assertEquals(msg1, msg2) // Same id = equal
    }

    @Test
    fun `different ids are not equal`() {
        val msg1 = makeMessage(id = "tx1")
        val msg2 = makeMessage(id = "tx2")
        assertNotEquals(msg1, msg2)
    }

    @Test
    fun `hashCode is based on id only`() {
        val msg1 = makeMessage(id = "tx1")
        val msg2 = makeMessage(id = "tx1")
        assertEquals(msg1.hashCode(), msg2.hashCode())
    }
}

// ============================================================================
// Conversation Tests
// ============================================================================

class ConversationTest {

    private fun makeMessage(
        id: String,
        direction: MessageDirection = MessageDirection.SENT,
        timestamp: Instant = Instant.ofEpochSecond(1700000000)
    ) = Message(
        id = id,
        sender = if (direction == MessageDirection.SENT) "ALICE" else "BOB",
        recipient = if (direction == MessageDirection.SENT) "BOB" else "ALICE",
        content = "msg-$id",
        timestamp = timestamp,
        confirmedRound = 100,
        direction = direction
    )

    @Test
    fun `new conversation is empty`() {
        val conv = Conversation("BOB")

        assertEquals("BOB", conv.participant)
        assertEquals("BOB", conv.id)
        assertTrue(conv.isEmpty)
        assertEquals(0, conv.messageCount)
        assertTrue(conv.messages.isEmpty())
        assertNull(conv.lastMessage)
        assertNull(conv.lastReceived)
        assertNull(conv.lastSent)
    }

    @Test
    fun `append adds message`() {
        val conv = Conversation("BOB")
        val msg = makeMessage("tx1")

        conv.append(msg)

        assertEquals(1, conv.messageCount)
        assertFalse(conv.isEmpty)
        assertEquals("tx1", conv.messages[0].id)
    }

    @Test
    fun `append deduplicates by id`() {
        val conv = Conversation("BOB")
        val msg = makeMessage("tx1")

        conv.append(msg)
        conv.append(msg)

        assertEquals(1, conv.messageCount)
    }

    @Test
    fun `append maintains chronological order`() {
        val conv = Conversation("BOB")

        val later = makeMessage("tx1", timestamp = Instant.ofEpochSecond(2000000000))
        val earlier = makeMessage("tx2", timestamp = Instant.ofEpochSecond(1000000000))

        conv.append(later)
        conv.append(earlier)

        assertEquals("tx2", conv.messages[0].id)
        assertEquals("tx1", conv.messages[1].id)
    }

    @Test
    fun `lastMessage returns most recent`() {
        val conv = Conversation("BOB")

        conv.append(makeMessage("tx1", timestamp = Instant.ofEpochSecond(1000000000)))
        conv.append(makeMessage("tx2", timestamp = Instant.ofEpochSecond(2000000000)))

        assertEquals("tx2", conv.lastMessage!!.id)
    }

    @Test
    fun `lastReceived and lastSent filter by direction`() {
        val conv = Conversation("BOB")

        conv.append(makeMessage("sent-1", MessageDirection.SENT, Instant.ofEpochSecond(1)))
        conv.append(makeMessage("recv-1", MessageDirection.RECEIVED, Instant.ofEpochSecond(2)))
        conv.append(makeMessage("sent-2", MessageDirection.SENT, Instant.ofEpochSecond(3)))

        assertEquals("recv-1", conv.lastReceived!!.id)
        assertEquals("sent-2", conv.lastSent!!.id)
    }

    @Test
    fun `receivedMessages and sentMessages filter correctly`() {
        val conv = Conversation("BOB")

        conv.append(makeMessage("sent-1", MessageDirection.SENT, Instant.ofEpochSecond(1)))
        conv.append(makeMessage("recv-1", MessageDirection.RECEIVED, Instant.ofEpochSecond(2)))
        conv.append(makeMessage("sent-2", MessageDirection.SENT, Instant.ofEpochSecond(3)))

        assertEquals(2, conv.sentMessages.size)
        assertEquals(1, conv.receivedMessages.size)
    }

    @Test
    fun `merge adds multiple messages`() {
        val conv = Conversation("BOB")

        val messages = listOf(
            makeMessage("tx1", timestamp = Instant.ofEpochSecond(1)),
            makeMessage("tx2", timestamp = Instant.ofEpochSecond(2)),
            makeMessage("tx3", timestamp = Instant.ofEpochSecond(3))
        )

        conv.merge(messages)

        assertEquals(3, conv.messageCount)
    }

    @Test
    fun `merge deduplicates`() {
        val conv = Conversation("BOB")

        conv.append(makeMessage("tx1", timestamp = Instant.ofEpochSecond(1)))

        conv.merge(listOf(
            makeMessage("tx1", timestamp = Instant.ofEpochSecond(1)),
            makeMessage("tx2", timestamp = Instant.ofEpochSecond(2))
        ))

        assertEquals(2, conv.messageCount)
    }

    @Test
    fun `participantEncryptionKey can be set`() {
        val conv = Conversation("BOB")
        assertNull(conv.participantEncryptionKey)

        val key = ByteArray(32) { it.toByte() }
        conv.participantEncryptionKey = key

        assertNotNull(conv.participantEncryptionKey)
        assertTrue(key.contentEquals(conv.participantEncryptionKey!!))
    }

    @Test
    fun `lastFetchedRound can be set`() {
        val conv = Conversation("BOB")
        assertNull(conv.lastFetchedRound)

        conv.lastFetchedRound = 500L
        assertEquals(500L, conv.lastFetchedRound)
    }
}

// ============================================================================
// DiscoveredKey Tests
// ============================================================================

class DiscoveredKeyTest {

    @Test
    fun `equals compares public key contents and isVerified`() {
        val key1 = DiscoveredKey(ByteArray(32) { 1 }, isVerified = true)
        val key2 = DiscoveredKey(ByteArray(32) { 1 }, isVerified = true)
        val key3 = DiscoveredKey(ByteArray(32) { 2 }, isVerified = true)
        val key4 = DiscoveredKey(ByteArray(32) { 1 }, isVerified = false)

        assertEquals(key1, key2)
        assertNotEquals(key1, key3) // different key
        assertNotEquals(key1, key4) // different verified
    }

    @Test
    fun `hashCode consistent with equals`() {
        val key1 = DiscoveredKey(ByteArray(32) { 1 }, isVerified = true)
        val key2 = DiscoveredKey(ByteArray(32) { 1 }, isVerified = true)
        assertEquals(key1.hashCode(), key2.hashCode())
    }
}

// ============================================================================
// SendOptions Tests
// ============================================================================

class SendOptionsTest {

    @Test
    fun `fireAndForget creates default options`() {
        val opts = SendOptions.fireAndForget()
        assertFalse(opts.waitForConfirmation)
        assertFalse(opts.waitForIndexer)
        assertNull(opts.replyContext)
    }

    @Test
    fun `confirmed enables confirmation wait`() {
        val opts = SendOptions.confirmed()
        assertTrue(opts.waitForConfirmation)
        assertFalse(opts.waitForIndexer)
    }

    @Test
    fun `indexed enables both waits`() {
        val opts = SendOptions.indexed()
        assertTrue(opts.waitForConfirmation)
        assertTrue(opts.waitForIndexer)
    }

    @Test
    fun `replyingTo creates options with reply context`() {
        val msg = Message(
            id = "tx1",
            sender = "ALICE",
            recipient = "BOB",
            content = "original message",
            timestamp = Instant.ofEpochSecond(1700000000),
            confirmedRound = 100,
            direction = MessageDirection.SENT
        )

        val opts = SendOptions.replyingTo(msg)
        assertNotNull(opts.replyContext)
        assertEquals("tx1", opts.replyContext!!.messageId)
    }

    @Test
    fun `withReply copies options with new reply context`() {
        val opts = SendOptions.confirmed()
        val reply = ReplyContext("tx1", "preview")
        val withReply = opts.withReply(reply)

        assertTrue(withReply.waitForConfirmation)
        assertEquals("tx1", withReply.replyContext!!.messageId)
    }
}

// ============================================================================
// PendingMessage Tests
// ============================================================================

class PendingMessageTest {

    @Test
    fun `create generates unique id`() {
        val msg1 = PendingMessage.create("BOB", "hello")
        val msg2 = PendingMessage.create("BOB", "hello")

        assertNotEquals(msg1.id, msg2.id)
    }

    @Test
    fun `create sets initial status to PENDING`() {
        val msg = PendingMessage.create("BOB", "hello")

        assertEquals(PendingStatus.PENDING, msg.status)
        assertEquals(0, msg.retryCount)
        assertNull(msg.lastAttempt)
        assertNull(msg.lastError)
    }

    @Test
    fun `create with reply context`() {
        val reply = ReplyContext("tx1", "preview")
        val msg = PendingMessage.create("BOB", "hello", reply)

        assertEquals("tx1", msg.replyContext!!.messageId)
    }

    @Test
    fun `markSending transitions to SENDING and records time`() {
        val msg = PendingMessage.create("BOB", "hello")

        msg.markSending()

        assertEquals(PendingStatus.SENDING, msg.status)
        assertNotNull(msg.lastAttempt)
    }

    @Test
    fun `markFailed transitions to FAILED and increments retry`() {
        val msg = PendingMessage.create("BOB", "hello")

        msg.markFailed("network error")

        assertEquals(PendingStatus.FAILED, msg.status)
        assertEquals(1, msg.retryCount)
        assertEquals("network error", msg.lastError)
    }

    @Test
    fun `markSent transitions to SENT`() {
        val msg = PendingMessage.create("BOB", "hello")

        msg.markSent()

        assertEquals(PendingStatus.SENT, msg.status)
    }

    @Test
    fun `canRetry returns true when under max retries and failed`() {
        val msg = PendingMessage.create("BOB", "hello")
        msg.markFailed("error") // retryCount = 1

        assertTrue(msg.canRetry(3))
    }

    @Test
    fun `canRetry returns false when at max retries`() {
        val msg = PendingMessage.create("BOB", "hello")
        msg.markFailed("error") // 1
        msg.markFailed("error") // 2
        msg.markFailed("error") // 3

        assertFalse(msg.canRetry(3))
    }

    @Test
    fun `canRetry returns false when not in FAILED status`() {
        val msg = PendingMessage.create("BOB", "hello")
        // Status is PENDING, not FAILED
        assertFalse(msg.canRetry(3))
    }
}

// ============================================================================
// Blockchain Config Tests
// ============================================================================

class BlockchainConfigTest {

    @Test
    fun `localnet config has expected values`() {
        val config = AlgorandConfig.localnet()
        assertEquals("http://localhost:4001", config.algodUrl)
        assertEquals("a".repeat(64), config.algodToken)
        assertEquals("http://localhost:8980", config.indexerUrl)
    }

    @Test
    fun `testnet config has expected values`() {
        val config = AlgorandConfig.testnet()
        assertTrue(config.algodUrl.contains("testnet"))
        assertTrue(config.indexerUrl!!.contains("testnet"))
    }

    @Test
    fun `mainnet config has expected values`() {
        val config = AlgorandConfig.mainnet()
        assertTrue(config.algodUrl.contains("mainnet"))
        assertTrue(config.indexerUrl!!.contains("mainnet"))
    }

    @Test
    fun `withIndexer sets indexer configuration`() {
        val config = AlgorandConfig(
            algodUrl = "http://localhost:4001",
            algodToken = "token"
        ).withIndexer("http://localhost:8980", "idx-token")

        assertEquals("http://localhost:8980", config.indexerUrl)
        assertEquals("idx-token", config.indexerToken)
    }

    @Test
    fun `AlgoChatConfig factory methods`() {
        val local = AlgoChatConfig.localnet()
        assertTrue(local.autoDiscoverKeys)
        assertTrue(local.cachePublicKeys)
        assertTrue(local.cacheMessages)
        assertEquals("http://localhost:4001", local.network.algodUrl)

        val test = AlgoChatConfig.testnet()
        assertTrue(test.network.algodUrl.contains("testnet"))

        val main = AlgoChatConfig.mainnet()
        assertTrue(main.network.algodUrl.contains("mainnet"))
    }
}

// ============================================================================
// NoteTransaction Tests
// ============================================================================

class NoteTransactionTest {

    @Test
    fun `equals is based on txid only`() {
        val tx1 = NoteTransaction("tx1", "A", "B", ByteArray(10), 100, 1700000000)
        val tx2 = NoteTransaction("tx1", "C", "D", ByteArray(20), 200, 1800000000)

        assertEquals(tx1, tx2)
    }

    @Test
    fun `different txids are not equal`() {
        val tx1 = NoteTransaction("tx1", "A", "B", ByteArray(10), 100, 1700000000)
        val tx2 = NoteTransaction("tx2", "A", "B", ByteArray(10), 100, 1700000000)

        assertNotEquals(tx1, tx2)
    }

    @Test
    fun `hashCode based on txid`() {
        val tx1 = NoteTransaction("tx1", "A", "B", ByteArray(10), 100, 1700000000)
        val tx2 = NoteTransaction("tx1", "C", "D", ByteArray(20), 200, 1800000000)

        assertEquals(tx1.hashCode(), tx2.hashCode())
    }
}

// ============================================================================
// SuggestedParams Tests
// ============================================================================

class SuggestedParamsTest {

    @Test
    fun `equals compares all fields including genesis hash contents`() {
        val params1 = SuggestedParams(1000, 1000, 100, 200, "testnet-v1", ByteArray(32) { 1 })
        val params2 = SuggestedParams(1000, 1000, 100, 200, "testnet-v1", ByteArray(32) { 1 })
        val params3 = SuggestedParams(1000, 1000, 100, 200, "testnet-v1", ByteArray(32) { 2 })

        assertEquals(params1, params2)
        assertNotEquals(params1, params3) // different genesis hash
    }

    @Test
    fun `hashCode consistent with equals`() {
        val params1 = SuggestedParams(1000, 1000, 100, 200, "testnet-v1", ByteArray(32) { 1 })
        val params2 = SuggestedParams(1000, 1000, 100, 200, "testnet-v1", ByteArray(32) { 1 })

        assertEquals(params1.hashCode(), params2.hashCode())
    }
}
