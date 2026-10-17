package com.corvidlabs.algochat

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters
import org.bouncycastle.crypto.params.X25519PrivateKeyParameters
import org.bouncycastle.crypto.params.X25519PublicKeyParameters
import java.time.Instant

/**
 * Configuration for the AlgoChat client.
 */
data class AlgoChatConfig(
    /** Algorand network configuration. */
    val network: AlgorandConfig,
    /** Whether to automatically discover recipient keys. */
    val autoDiscoverKeys: Boolean = true,
    /** Whether to cache public keys. */
    val cachePublicKeys: Boolean = true,
    /** Whether to cache messages locally. */
    val cacheMessages: Boolean = true
) {
    companion object {
        /** Creates a configuration for LocalNet. */
        fun localnet() = AlgoChatConfig(network = AlgorandConfig.localnet())

        /** Creates a configuration for TestNet. */
        fun testnet() = AlgoChatConfig(network = AlgorandConfig.testnet())

        /** Creates a configuration for MainNet. */
        fun mainnet() = AlgoChatConfig(network = AlgorandConfig.mainnet())
    }
}

/**
 * The main AlgoChat client for encrypted messaging.
 *
 * This provides a high-level API for sending and receiving encrypted
 * messages on the Algorand blockchain.
 */
class AlgoChatClient private constructor(
    /** The user's Algorand address. */
    val address: String,
    private val ed25519PublicKey: ByteArray,
    private val encryptionKeyPair: KeyPair,
    private val config: AlgoChatConfig,
    private val algod: AlgodClient,
    private val indexer: IndexerClient,
    private val keyStorage: EncryptionKeyStorage,
    private val messageCache: MessageCache
) {
    private val publicKeyCache = PublicKeyCache()
    private val sendQueue = SendQueue()
    private val conversations = mutableListOf<Conversation>()
    private val mutex = Mutex()

    /** The user's encryption public key as bytes. */
    val encryptionPublicKey: ByteArray
        get() = Keys.publicKeyToBytes(encryptionKeyPair.publicKey)

    companion object {
        /**
         * Creates a new AlgoChat client from an Algorand account seed.
         *
         * The seed should be the 32-byte Ed25519 private key from an Algorand account.
         */
        suspend fun fromSeed(
            seed: ByteArray,
            address: String,
            config: AlgoChatConfig,
            algod: AlgodClient,
            indexer: IndexerClient,
            keyStorage: EncryptionKeyStorage = InMemoryKeyStorage(),
            messageCache: MessageCache = InMemoryMessageCache()
        ): AlgoChatClient {
            require(seed.size == 32) { "Seed must be 32 bytes" }

            // Derive encryption keys from the seed
            val keyPair = Keys.deriveKeysFromSeed(seed)

            // Store the encryption key (as bytes for storage)
            val privateKeyBytes = keyPair.privateKey.encoded
            keyStorage.store(privateKeyBytes, address, false)

            // Derive the Ed25519 public key from the seed (private key)
            val ed25519Private = Ed25519PrivateKeyParameters(seed, 0)
            val ed25519PublicKey = ed25519Private.generatePublicKey().encoded

            return AlgoChatClient(
                address = address,
                ed25519PublicKey = ed25519PublicKey,
                encryptionKeyPair = keyPair,
                config = config,
                algod = algod,
                indexer = indexer,
                keyStorage = keyStorage,
                messageCache = messageCache
            )
        }
    }

    /**
     * Gets or creates a conversation with the given participant.
     */
    suspend fun conversation(participant: String): Conversation {
        mutex.withLock {
            val existing = conversations.find { it.participant == participant }
            if (existing != null) return existing

            val conv = Conversation(participant)
            conversations.add(conv)
            return conv
        }
    }

    /**
     * Lists all conversations.
     */
    suspend fun conversations(): List<Conversation> {
        mutex.withLock {
            return conversations.toList()
        }
    }

    /**
     * Discovers the encryption public key for an address.
     */
    suspend fun discoverKey(address: String): DiscoveredKey? {
        // Check cache first. Preserve the verification status that was recorded
        // when the key was originally discovered rather than assuming verified.
        if (config.cachePublicKeys) {
            val cached = publicKeyCache.retrieveVerified(address)
            if (cached != null) {
                return DiscoveredKey(
                    publicKey = cached.key,
                    isVerified = cached.verified,
                    address = address
                )
            }
        }

        // Search indexer for key announcement
        val key = discoverEncryptionKey(indexer, address)

        // Cache if found, recording its verification status
        if (key != null && config.cachePublicKeys) {
            publicKeyCache.store(address, key.publicKey, key.isVerified)
        }

        return key
    }

    /**
     * Encrypts a message for a recipient.
     */
    fun encrypt(message: String, recipientPublicKeyBytes: ByteArray): ByteArray {
        val recipientPublicKey = Keys.publicKeyFromBytes(recipientPublicKeyBytes)

        val envelope = Crypto.encryptMessage(
            message,
            encryptionKeyPair.privateKey,
            encryptionKeyPair.publicKey,
            recipientPublicKey
        )

        return envelope.encode()
    }

    /**
     * Decrypts a message from a sender.
     *
     * @return The decrypted text content.
     */
    fun decrypt(envelopeBytes: ByteArray, senderPublicKeyBytes: ByteArray): String {
        return decryptFull(envelopeBytes).text
    }

    /**
     * Decrypts a message and returns the full [DecryptedContent] including reply context.
     *
     * @return Decrypted content with text and optional reply metadata.
     */
    fun decryptFull(envelopeBytes: ByteArray): DecryptedContent {
        if (!isChatMessage(envelopeBytes)) {
            throw AlgoChatException.InvalidEnvelope("Not an AlgoChat message")
        }

        val envelope = ChatEnvelope.decode(envelopeBytes)

        return Crypto.decryptMessage(
            envelope,
            encryptionKeyPair.privateKey,
            encryptionKeyPair.publicKey
        ) ?: throw AlgoChatException.DecryptionFailed("Failed to decrypt message")
    }

    /**
     * Processes a transaction and extracts any chat message.
     */
    suspend fun processTransaction(tx: NoteTransaction): Message? {
        // Check if this is a chat message
        if (!isChatMessage(tx.note)) {
            return null
        }

        // Determine direction
        val direction = when {
            tx.sender == address -> MessageDirection.SENT
            tx.receiver == address -> MessageDirection.RECEIVED
            else -> return null  // Not relevant to us
        }

        // Get the other party's address and key. For received messages the
        // sender's announced key must be cryptographically verified, otherwise a
        // key substitution attack could trick us into trusting an attacker key.
        val (otherAddress, otherKey) = when (direction) {
            MessageDirection.SENT -> {
                val key = discoverKey(tx.receiver)
                    ?: throw AlgoChatException.PublicKeyNotFound(tx.receiver)
                tx.receiver to key.publicKey
            }
            MessageDirection.RECEIVED -> {
                val key = discoverKey(tx.sender)
                    ?: throw AlgoChatException.PublicKeyNotFound(tx.sender)
                if (!key.isVerified) {
                    throw AlgoChatException.UnverifiedKey(tx.sender)
                }
                tx.sender to key.publicKey
            }
        }

        // Decrypt the message (full content including reply context)
        val decrypted = decryptFull(tx.note)

        // Build reply context from decrypted content
        val replyContext = if (decrypted.replyToId != null) {
            ReplyContext(decrypted.replyToId, decrypted.replyToPreview ?: "")
        } else null

        // Create message
        val timestamp = Instant.ofEpochSecond(tx.roundTime)

        val message = Message(
            id = tx.txid,
            sender = tx.sender,
            recipient = tx.receiver,
            content = decrypted.text,
            timestamp = timestamp,
            confirmedRound = tx.confirmedRound,
            direction = direction,
            replyContext = replyContext
        )

        // Update conversation
        mutex.withLock {
            val conv = conversations.find { it.participant == otherAddress }
            if (conv != null) {
                conv.append(message)
            } else {
                val newConv = Conversation(otherAddress)
                newConv.append(message)
                conversations.add(newConv)
            }
        }

        // Cache message
        if (config.cacheMessages) {
            messageCache.store(listOf(message), message.sender)
        }

        return message
    }

    /**
     * Fetches new messages from the blockchain.
     */
    suspend fun sync(): List<Message> {
        val allMessages = mutableListOf<Message>()

        // Get transactions for our address
        val txs = indexer.searchTransactions(address, limit = 100)

        for (tx in txs) {
            val message = processTransaction(tx)
            if (message != null) {
                allMessages.add(message)
            }
        }

        return allMessages
    }

    /**
     * Returns the send queue for managing pending messages.
     */
    fun sendQueue(): SendQueue = sendQueue

    /**
     * Returns the message cache.
     */
    fun messageCache(): MessageCache = messageCache

    /**
     * Returns the public key cache.
     */
    fun publicKeyCache(): PublicKeyCache = publicKeyCache
}
