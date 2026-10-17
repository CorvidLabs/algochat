package com.corvidlabs.algochat

import java.time.Instant
import java.util.UUID

/**
 * Context for a reply message, linking it to the original.
 */
data class ReplyContext(
    /** Transaction ID of the original message. */
    val messageId: String,
    /** Preview of the original message (truncated). */
    val preview: String
) {
    companion object {
        /**
         * Creates a reply context from a message, truncating the preview.
         */
        fun fromMessage(message: Message, maxLength: Int = 80): ReplyContext {
            val preview = if (message.content.length > maxLength) {
                message.content.take(maxLength - 3) + "..."
            } else {
                message.content
            }
            return ReplyContext(message.id, preview)
        }
    }
}

/**
 * Direction of a message relative to the current user.
 */
enum class MessageDirection {
    SENT,
    RECEIVED
}

/**
 * A chat message between Algorand addresses.
 */
data class Message(
    /** Unique identifier (transaction ID). */
    val id: String,
    /** Sender's Algorand address. */
    val sender: String,
    /** Recipient's Algorand address. */
    val recipient: String,
    /** Decrypted message content. */
    val content: String,
    /** Timestamp when the message was confirmed on-chain. */
    val timestamp: Instant,
    /** The round in which the transaction was confirmed. */
    val confirmedRound: Long,
    /** Message direction relative to the current user. */
    val direction: MessageDirection,
    /** Reply context if this message is a reply. */
    val replyContext: ReplyContext? = null,
    /** Payment amount in microAlgos (0 for minimum-fee messages). */
    val amount: Long = 0,
    /** Transaction fee in microAlgos. */
    val fee: Long = 0,
    /** Offset within the round for fine-grained ordering. */
    val intraRoundOffset: Int = 0
) {
    /** Whether this message is a reply to another message. */
    val isReply: Boolean get() = replyContext != null

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is Message) return false
        return id == other.id
    }

    override fun hashCode(): Int = id.hashCode()
}

/**
 * A conversation between two Algorand addresses.
 */
class Conversation(
    /** The other party's Algorand address. */
    val participant: String,
    /** Cached encryption public key for the participant (32 bytes). */
    var participantEncryptionKey: ByteArray? = null
) {
    private val _messages = mutableListOf<Message>()

    /** The round of the last fetched message (for pagination). */
    var lastFetchedRound: Long? = null

    /** Returns the unique identifier (the participant's address). */
    val id: String get() = participant

    /** Returns all messages in the conversation. */
    val messages: List<Message> get() = _messages.toList()

    /** Returns the most recent message. */
    val lastMessage: Message? get() = _messages.lastOrNull()

    /** Returns the most recent received message. */
    val lastReceived: Message?
        get() = _messages.lastOrNull { it.direction == MessageDirection.RECEIVED }

    /** Returns the most recent sent message. */
    val lastSent: Message?
        get() = _messages.lastOrNull { it.direction == MessageDirection.SENT }

    /** Returns all received messages. */
    val receivedMessages: List<Message>
        get() = _messages.filter { it.direction == MessageDirection.RECEIVED }

    /** Returns all sent messages. */
    val sentMessages: List<Message>
        get() = _messages.filter { it.direction == MessageDirection.SENT }

    /** Returns the number of messages. */
    val messageCount: Int get() = _messages.size

    /** Whether the conversation has any messages. */
    val isEmpty: Boolean get() = _messages.isEmpty()

    /**
     * Adds a message to the conversation (maintains chronological order).
     */
    fun append(message: Message) {
        if (_messages.any { it.id == message.id }) return
        _messages.add(message)
        _messages.sortBy { it.timestamp }
    }

    /**
     * Merges new messages into the conversation.
     */
    fun merge(newMessages: List<Message>) {
        newMessages.forEach { append(it) }
    }

    /**
     * Checks whether the conversation contains a message with the given ID.
     */
    fun hasMessage(id: String): Boolean = _messages.any { it.id == id }

    /**
     * Looks up a message by its transaction ID.
     *
     * @return The message, or null if not found.
     */
    fun getById(id: String): Message? = _messages.find { it.id == id }

    /**
     * Returns messages confirmed after the given round (exclusive).
     */
    fun messagesAfterRound(round: Long): List<Message> =
        _messages.filter { it.confirmedRound > round }

    /**
     * Returns messages filtered by direction.
     */
    fun messagesInDirection(direction: MessageDirection): List<Message> =
        _messages.filter { it.direction == direction }

    /**
     * Returns the highest confirmed round across all messages, or null if empty.
     */
    fun highestRound(): Long? = _messages.maxOfOrNull { it.confirmedRound }

    /**
     * Removes all messages from the conversation.
     */
    fun clear() {
        _messages.clear()
    }
}

/**
 * Result of discovering a user's encryption key.
 */
data class DiscoveredKey(
    /** The X25519 public key (32 bytes). */
    val publicKey: ByteArray,
    /** Whether the key was cryptographically verified via Ed25519 signature. */
    val isVerified: Boolean,
    /** The Algorand address that published this key. */
    val address: String? = null,
    /** Transaction ID in which the key was discovered. */
    val discoveredInTx: String? = null,
    /** Round in which the key was discovered. */
    val discoveredAtRound: Long? = null,
    /** Timestamp when the key was discovered (from on-chain round time). */
    val discoveredAt: Instant? = null
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is DiscoveredKey) return false
        return publicKey.contentEquals(other.publicKey) &&
            isVerified == other.isVerified &&
            address == other.address &&
            discoveredInTx == other.discoveredInTx &&
            discoveredAtRound == other.discoveredAtRound &&
            discoveredAt == other.discoveredAt
    }

    override fun hashCode(): Int {
        var result = publicKey.contentHashCode()
        result = 31 * result + isVerified.hashCode()
        result = 31 * result + (address?.hashCode() ?: 0)
        result = 31 * result + (discoveredInTx?.hashCode() ?: 0)
        result = 31 * result + (discoveredAtRound?.hashCode() ?: 0)
        result = 31 * result + (discoveredAt?.hashCode() ?: 0)
        return result
    }
}

/**
 * Options for sending a message.
 */
data class SendOptions(
    /** Wait for algod confirmation. */
    val waitForConfirmation: Boolean = false,
    /** Maximum rounds to wait for confirmation. */
    val timeoutRounds: Int = 10,
    /** Wait for indexer visibility. */
    val waitForIndexer: Boolean = false,
    /** Maximum seconds to wait for indexer. */
    val indexerTimeoutSecs: Int = 30,
    /** Reply context if replying to a message. */
    val replyContext: ReplyContext? = null,
    /** Custom payment amount in microAlgos (null uses the protocol minimum). */
    val customAmount: Long? = null
) {
    companion object {
        /** Fire-and-forget (no waiting). */
        fun fireAndForget() = SendOptions()

        /** Wait for algod confirmation only. */
        fun confirmed() = SendOptions(waitForConfirmation = true)

        /** Wait for both algod and indexer. */
        fun indexed() = SendOptions(waitForConfirmation = true, waitForIndexer = true)

        /** Create options for replying to a message. */
        fun replyingTo(message: Message) = SendOptions(
            replyContext = ReplyContext.fromMessage(message)
        )
    }

    /** Set the reply context. */
    fun withReply(context: ReplyContext) = copy(replyContext = context)
}

/**
 * Result of a successful send operation.
 */
data class SendResult(
    /** Transaction ID. */
    val txid: String,
    /** The sent message (for optimistic UI updates). */
    val message: Message
)

/**
 * Status of a pending message in the send queue.
 */
enum class PendingStatus {
    PENDING,
    SENDING,
    FAILED,
    SENT
}

/**
 * A message queued for sending (for offline support).
 */
data class PendingMessage(
    /** Unique identifier. */
    val id: String,
    /** Recipient's Algorand address. */
    val recipient: String,
    /** Message content. */
    val content: String,
    /** Reply context if replying. */
    val replyContext: ReplyContext? = null,
    /** When the message was created. */
    val createdAt: Instant = Instant.now(),
    /** Number of retry attempts. */
    var retryCount: Int = 0,
    /** Last attempt time. */
    var lastAttempt: Instant? = null,
    /** Current status. */
    var status: PendingStatus = PendingStatus.PENDING,
    /** Last error message. */
    var lastError: String? = null
) {
    companion object {
        /** Creates a new pending message. */
        fun create(
            recipient: String,
            content: String,
            replyContext: ReplyContext? = null
        ) = PendingMessage(
            id = UUID.randomUUID().toString(),
            recipient = recipient,
            content = content,
            replyContext = replyContext
        )
    }

    /** Mark as currently sending. */
    fun markSending() {
        status = PendingStatus.SENDING
        lastAttempt = Instant.now()
    }

    /** Mark as failed with an error. */
    fun markFailed(error: String) {
        status = PendingStatus.FAILED
        retryCount++
        lastError = error
    }

    /** Mark as successfully sent. */
    fun markSent() {
        status = PendingStatus.SENT
    }

    /** Whether the message can be retried. */
    fun canRetry(maxRetries: Int): Boolean =
        retryCount < maxRetries && status == PendingStatus.FAILED
}
