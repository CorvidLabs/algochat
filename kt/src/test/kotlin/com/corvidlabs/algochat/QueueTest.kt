package com.corvidlabs.algochat

import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.Duration
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class QueueTest {

    private fun makePending(
        id: String = "msg-1",
        recipient: String = "BOB",
        content: String = "hello"
    ) = PendingMessage(
        id = id,
        recipient = recipient,
        content = content
    )

    // ========================================================================
    // Enqueue / Size
    // ========================================================================

    @Test
    fun `enqueue adds message to queue`() = runTest {
        val queue = SendQueue()

        queue.enqueue(makePending())

        assertEquals(1, queue.size())
        assertFalse(queue.isEmpty())
    }

    @Test
    fun `enqueue throws when queue is full`() = runTest {
        val queue = SendQueue(QueueConfig(maxQueueSize = 2))

        queue.enqueue(makePending("msg-1"))
        queue.enqueue(makePending("msg-2"))

        assertThrows<IllegalStateException> {
            queue.enqueue(makePending("msg-3"))
        }
    }

    @Test
    fun `enqueue evicts expired failed messages when full`() = runTest {
        val queue = SendQueue(QueueConfig(maxQueueSize = 2, maxRetries = 1))

        val msg1 = makePending("msg-1")
        queue.enqueue(msg1)
        queue.markSending("msg-1")
        queue.markFailed("msg-1", "error")
        // msg-1 has retryCount=1, maxRetries=1, so canRetry=false

        queue.enqueue(makePending("msg-2"))
        // Queue is full but msg-1 can be evicted
        queue.enqueue(makePending("msg-3"))

        assertEquals(2, queue.size())
    }

    // ========================================================================
    // Next Pending / All Pending
    // ========================================================================

    @Test
    fun `nextPending returns first pending message`() = runTest {
        val queue = SendQueue()

        queue.enqueue(makePending("msg-1"))
        queue.enqueue(makePending("msg-2"))

        val next = queue.nextPending()
        assertNotNull(next)
        assertEquals("msg-1", next.id)
    }

    @Test
    fun `nextPending returns null when empty`() = runTest {
        val queue = SendQueue()
        assertNull(queue.nextPending())
    }

    @Test
    fun `nextPending skips non-pending messages`() = runTest {
        val queue = SendQueue()

        queue.enqueue(makePending("msg-1"))
        queue.markSending("msg-1")
        queue.enqueue(makePending("msg-2"))

        val next = queue.nextPending()
        assertNotNull(next)
        assertEquals("msg-2", next.id)
    }

    @Test
    fun `allPending returns only pending messages`() = runTest {
        val queue = SendQueue()

        queue.enqueue(makePending("msg-1"))
        queue.enqueue(makePending("msg-2"))
        queue.markSending("msg-1")

        val pending = queue.allPending()
        assertEquals(1, pending.size)
        assertEquals("msg-2", pending[0].id)
    }

    // ========================================================================
    // Status Transitions
    // ========================================================================

    @Test
    fun `markSending transitions to SENDING status`() = runTest {
        val queue = SendQueue()
        queue.enqueue(makePending("msg-1"))

        queue.markSending("msg-1")

        assertNull(queue.nextPending()) // No longer pending
    }

    @Test
    fun `markSent transitions to SENT status`() = runTest {
        val queue = SendQueue()
        queue.enqueue(makePending("msg-1"))
        queue.markSending("msg-1")

        queue.markSent("msg-1")

        assertEquals(1, queue.size())
        assertEquals(0, queue.pendingCount())
    }

    @Test
    fun `markFailed transitions to FAILED status`() = runTest {
        val queue = SendQueue()
        queue.enqueue(makePending("msg-1"))
        queue.markSending("msg-1")

        queue.markFailed("msg-1", "network error")

        assertEquals(1, queue.failedCount())
    }

    @Test
    fun `markSending throws for unknown id`() = runTest {
        val queue = SendQueue()

        assertThrows<NoSuchElementException> {
            queue.markSending("nonexistent")
        }
    }

    @Test
    fun `markSent throws for unknown id`() = runTest {
        val queue = SendQueue()

        assertThrows<NoSuchElementException> {
            queue.markSent("nonexistent")
        }
    }

    @Test
    fun `markFailed throws for unknown id`() = runTest {
        val queue = SendQueue()

        assertThrows<NoSuchElementException> {
            queue.markFailed("nonexistent", "error")
        }
    }

    // ========================================================================
    // Retry Logic
    // ========================================================================

    @Test
    fun `readyForRetry returns failed messages eligible for retry`() = runTest {
        val queue = SendQueue(QueueConfig(maxRetries = 3, retryDelay = Duration.ZERO))

        queue.enqueue(makePending("msg-1"))
        queue.markSending("msg-1")
        queue.markFailed("msg-1", "error")

        val retryable = queue.readyForRetry()
        assertEquals(1, retryable.size)
        assertEquals("msg-1", retryable[0].id)
    }

    @Test
    fun `readyForRetry excludes messages exceeding max retries`() = runTest {
        val queue = SendQueue(QueueConfig(maxRetries = 1, retryDelay = Duration.ZERO))

        queue.enqueue(makePending("msg-1"))
        queue.markSending("msg-1")
        queue.markFailed("msg-1", "error") // retryCount=1, maxRetries=1

        val retryable = queue.readyForRetry()
        assertTrue(retryable.isEmpty())
    }

    @Test
    fun `readyForRetry respects retry delay`() = runTest {
        val queue = SendQueue(QueueConfig(maxRetries = 3, retryDelay = Duration.ofHours(1)))

        queue.enqueue(makePending("msg-1"))
        queue.markSending("msg-1")
        queue.markFailed("msg-1", "error")

        // Should not be ready yet (1 hour delay)
        val retryable = queue.readyForRetry()
        assertTrue(retryable.isEmpty())
    }

    @Test
    fun `resetForRetry resets failed message to pending`() = runTest {
        val queue = SendQueue(QueueConfig(maxRetries = 3))

        queue.enqueue(makePending("msg-1"))
        queue.markSending("msg-1")
        queue.markFailed("msg-1", "error")

        queue.resetForRetry("msg-1")

        assertEquals(1, queue.pendingCount())
        assertEquals(0, queue.failedCount())
    }

    @Test
    fun `resetForRetry throws when max retries exceeded`() = runTest {
        val queue = SendQueue(QueueConfig(maxRetries = 1))

        queue.enqueue(makePending("msg-1"))
        queue.markSending("msg-1")
        queue.markFailed("msg-1", "error") // retryCount=1 == maxRetries

        assertThrows<IllegalStateException> {
            queue.resetForRetry("msg-1")
        }
    }

    @Test
    fun `resetForRetry throws for unknown id`() = runTest {
        val queue = SendQueue()

        assertThrows<NoSuchElementException> {
            queue.resetForRetry("nonexistent")
        }
    }

    // ========================================================================
    // Remove / Prune
    // ========================================================================

    @Test
    fun `remove removes message and returns it`() = runTest {
        val queue = SendQueue()
        queue.enqueue(makePending("msg-1"))

        val removed = queue.remove("msg-1")
        assertNotNull(removed)
        assertEquals("msg-1", removed.id)
        assertTrue(queue.isEmpty())
    }

    @Test
    fun `remove returns null for unknown id`() = runTest {
        val queue = SendQueue()
        assertNull(queue.remove("nonexistent"))
    }

    @Test
    fun `pruneSent removes only sent messages`() = runTest {
        val queue = SendQueue()

        queue.enqueue(makePending("msg-1"))
        queue.enqueue(makePending("msg-2"))
        queue.markSending("msg-1")
        queue.markSent("msg-1")

        queue.pruneSent()

        assertEquals(1, queue.size())
        assertNotNull(queue.nextPending())
    }

    @Test
    fun `pruneFailed removes only exhausted failed messages`() = runTest {
        val queue = SendQueue(QueueConfig(maxRetries = 1))

        queue.enqueue(makePending("msg-1"))
        queue.markSending("msg-1")
        queue.markFailed("msg-1", "error") // exhausted (retryCount=1 >= maxRetries=1)

        queue.enqueue(makePending("msg-2"))

        queue.pruneFailed()

        assertEquals(1, queue.size())
        assertEquals("msg-2", queue.nextPending()!!.id)
    }

    @Test
    fun `clear removes all messages`() = runTest {
        val queue = SendQueue()
        queue.enqueue(makePending("msg-1"))
        queue.enqueue(makePending("msg-2"))

        queue.clear()

        assertTrue(queue.isEmpty())
        assertEquals(0, queue.size())
    }

    // ========================================================================
    // Filtering
    // ========================================================================

    @Test
    fun `messagesFor returns messages for specific recipient`() = runTest {
        val queue = SendQueue()

        queue.enqueue(makePending("msg-1", recipient = "BOB"))
        queue.enqueue(makePending("msg-2", recipient = "ALICE"))
        queue.enqueue(makePending("msg-3", recipient = "BOB"))

        val bobMessages = queue.messagesFor("BOB")
        assertEquals(2, bobMessages.size)
        assertTrue(bobMessages.all { it.recipient == "BOB" })
    }

    @Test
    fun `pendingCount and failedCount track correctly`() = runTest {
        val queue = SendQueue(QueueConfig(maxRetries = 3))

        queue.enqueue(makePending("msg-1"))
        queue.enqueue(makePending("msg-2"))
        queue.enqueue(makePending("msg-3"))

        assertEquals(3, queue.pendingCount())
        assertEquals(0, queue.failedCount())

        queue.markSending("msg-1")
        queue.markFailed("msg-1", "error")

        assertEquals(2, queue.pendingCount())
        assertEquals(1, queue.failedCount())
    }
}

// ============================================================================
// QueueConfig Tests
// ============================================================================

class QueueConfigTest {

    @Test
    fun `default config has expected values`() {
        val config = QueueConfig()
        assertEquals(3, config.maxRetries)
        assertEquals(Duration.ofSeconds(5), config.retryDelay)
        assertEquals(100, config.maxQueueSize)
    }

    @Test
    fun `custom config overrides defaults`() {
        val config = QueueConfig(
            maxRetries = 10,
            retryDelay = Duration.ofMinutes(1),
            maxQueueSize = 50
        )
        assertEquals(10, config.maxRetries)
        assertEquals(Duration.ofMinutes(1), config.retryDelay)
        assertEquals(50, config.maxQueueSize)
    }
}
