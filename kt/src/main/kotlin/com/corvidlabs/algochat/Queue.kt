package com.corvidlabs.algochat

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.Duration
import java.time.Instant

/**
 * Configuration for the send queue.
 */
data class QueueConfig(
    /** Maximum number of retry attempts. */
    val maxRetries: Int = 3,
    /** Delay between retry attempts. */
    val retryDelay: Duration = Duration.ofSeconds(5),
    /** Maximum queue size. */
    val maxQueueSize: Int = 100
)

/**
 * A queue for managing pending outgoing messages.
 *
 * Supports offline message composition and automatic retry.
 */
class SendQueue(
    private val config: QueueConfig = QueueConfig()
) {
    private val queue = mutableListOf<PendingMessage>()
    private val mutex = Mutex()

    /**
     * Enqueues a new message for sending.
     *
     * @throws IllegalStateException if the queue is full
     */
    suspend fun enqueue(message: PendingMessage) {
        mutex.withLock {
            if (queue.size >= config.maxQueueSize) {
                // Remove oldest failed messages to make room
                queue.removeIf { it.status == PendingStatus.FAILED && !it.canRetry(config.maxRetries) }

                if (queue.size >= config.maxQueueSize) {
                    throw IllegalStateException("Queue is full")
                }
            }

            queue.add(message)
        }
    }

    /**
     * Returns the next message ready for sending.
     */
    suspend fun nextPending(): PendingMessage? {
        mutex.withLock {
            return queue.firstOrNull { it.status == PendingStatus.PENDING }
        }
    }

    /**
     * Returns all pending messages.
     */
    suspend fun allPending(): List<PendingMessage> {
        mutex.withLock {
            return queue.filter { it.status == PendingStatus.PENDING }.toList()
        }
    }

    /**
     * Returns messages ready for retry.
     */
    suspend fun readyForRetry(): List<PendingMessage> {
        mutex.withLock {
            val now = Instant.now()
            return queue.filter { msg ->
                if (!msg.canRetry(config.maxRetries)) {
                    return@filter false
                }

                val lastAttempt = msg.lastAttempt
                if (lastAttempt == null) {
                    true
                } else {
                    Duration.between(lastAttempt, now) >= config.retryDelay
                }
            }.toList()
        }
    }

    /**
     * Marks a message as currently sending.
     *
     * @throws NoSuchElementException if message not found
     */
    suspend fun markSending(id: String) {
        mutex.withLock {
            val msg = queue.find { it.id == id }
                ?: throw NoSuchElementException("Message not found: $id")
            msg.markSending()
        }
    }

    /**
     * Marks a message as successfully sent.
     *
     * @throws NoSuchElementException if message not found
     */
    suspend fun markSent(id: String) {
        mutex.withLock {
            val msg = queue.find { it.id == id }
                ?: throw NoSuchElementException("Message not found: $id")
            msg.markSent()
        }
    }

    /**
     * Marks a message as failed with an error.
     *
     * @throws NoSuchElementException if message not found
     */
    suspend fun markFailed(id: String, error: String) {
        mutex.withLock {
            val msg = queue.find { it.id == id }
                ?: throw NoSuchElementException("Message not found: $id")
            msg.markFailed(error)
        }
    }

    /**
     * Removes a message from the queue.
     */
    suspend fun remove(id: String): PendingMessage? {
        mutex.withLock {
            val index = queue.indexOfFirst { it.id == id }
            return if (index >= 0) queue.removeAt(index) else null
        }
    }

    /**
     * Removes all sent messages from the queue.
     */
    suspend fun pruneSent() {
        mutex.withLock {
            queue.removeIf { it.status == PendingStatus.SENT }
        }
    }

    /**
     * Removes all messages that have exceeded max retries.
     */
    suspend fun pruneFailed() {
        mutex.withLock {
            queue.removeIf { it.status == PendingStatus.FAILED && !it.canRetry(config.maxRetries) }
        }
    }

    /**
     * Clears all messages from the queue.
     */
    suspend fun clear() {
        mutex.withLock {
            queue.clear()
        }
    }

    /**
     * Returns the number of messages in the queue.
     */
    suspend fun size(): Int {
        mutex.withLock {
            return queue.size
        }
    }

    /**
     * Returns true if the queue is empty.
     */
    suspend fun isEmpty(): Boolean {
        mutex.withLock {
            return queue.isEmpty()
        }
    }

    /**
     * Returns the number of pending messages.
     */
    suspend fun pendingCount(): Int {
        mutex.withLock {
            return queue.count { it.status == PendingStatus.PENDING }
        }
    }

    /**
     * Returns the number of failed messages.
     */
    suspend fun failedCount(): Int {
        mutex.withLock {
            return queue.count { it.status == PendingStatus.FAILED }
        }
    }

    /**
     * Returns messages for a specific recipient.
     */
    suspend fun messagesFor(recipient: String): List<PendingMessage> {
        mutex.withLock {
            return queue.filter { it.recipient == recipient }.toList()
        }
    }

    /**
     * Resets a failed message to pending status for retry.
     *
     * @throws NoSuchElementException if message not found
     * @throws IllegalStateException if message has exceeded max retries
     */
    suspend fun resetForRetry(id: String) {
        mutex.withLock {
            val msg = queue.find { it.id == id }
                ?: throw NoSuchElementException("Message not found: $id")

            if (msg.canRetry(config.maxRetries)) {
                msg.status = PendingStatus.PENDING
            } else {
                throw IllegalStateException("Message has exceeded max retries")
            }
        }
    }
}
