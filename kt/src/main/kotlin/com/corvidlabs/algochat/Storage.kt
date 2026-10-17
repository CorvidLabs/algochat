package com.corvidlabs.algochat

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.Duration
import java.time.Instant

// ============================================================================
// Message Cache
// ============================================================================

/**
 * Interface for storing and retrieving messages.
 */
interface MessageCache {
    /** Store messages for a conversation. */
    suspend fun store(messages: List<Message>, participant: String)

    /** Retrieve cached messages for a conversation. */
    suspend fun retrieve(participant: String, afterRound: Long? = null): List<Message>

    /** Get the last synced round for a conversation. */
    suspend fun getLastSyncRound(participant: String): Long?

    /** Set the last synced round for a conversation. */
    suspend fun setLastSyncRound(round: Long, participant: String)

    /** Get all cached conversation participants. */
    suspend fun getCachedConversations(): List<String>

    /** Clear all cached data. */
    suspend fun clear()

    /** Clear cached data for a specific conversation. */
    suspend fun clearFor(participant: String)
}

/**
 * In-memory implementation of MessageCache.
 */
class InMemoryMessageCache : MessageCache {
    private val messages = mutableMapOf<String, MutableList<Message>>()
    private val syncRounds = mutableMapOf<String, Long>()
    private val mutex = Mutex()

    override suspend fun store(messages: List<Message>, participant: String) {
        mutex.withLock {
            val existing = this.messages.getOrPut(participant) { mutableListOf() }
            val existingIds = existing.map { it.id }.toSet()

            for (message in messages) {
                if (message.id !in existingIds) {
                    existing.add(message)
                }
            }

            existing.sortBy { it.timestamp }
        }
    }

    override suspend fun retrieve(participant: String, afterRound: Long?): List<Message> {
        mutex.withLock {
            val cached = messages[participant]?.toList() ?: emptyList()

            return if (afterRound != null) {
                cached.filter { it.confirmedRound > afterRound }
            } else {
                cached
            }
        }
    }

    override suspend fun getLastSyncRound(participant: String): Long? {
        mutex.withLock {
            return syncRounds[participant]
        }
    }

    override suspend fun setLastSyncRound(round: Long, participant: String) {
        mutex.withLock {
            syncRounds[participant] = round
        }
    }

    override suspend fun getCachedConversations(): List<String> {
        mutex.withLock {
            return messages.keys.toList()
        }
    }

    override suspend fun clear() {
        mutex.withLock {
            messages.clear()
            syncRounds.clear()
        }
    }

    override suspend fun clearFor(participant: String) {
        mutex.withLock {
            messages.remove(participant)
            syncRounds.remove(participant)
        }
    }
}

// ============================================================================
// Public Key Cache
// ============================================================================

/**
 * Entry in the public key cache with expiration.
 */
private data class CacheEntry(
    val key: ByteArray,
    val verified: Boolean,
    val expiresAt: Instant
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is CacheEntry) return false
        return key.contentEquals(other.key) && verified == other.verified && expiresAt == other.expiresAt
    }

    override fun hashCode(): Int {
        var result = key.contentHashCode()
        result = 31 * result + verified.hashCode()
        result = 31 * result + expiresAt.hashCode()
        return result
    }
}

/**
 * A cached public key together with whether it was cryptographically verified.
 */
data class CachedKey(
    /** The X25519 public key bytes. */
    val key: ByteArray,
    /** Whether the key was verified via an Ed25519 signature when discovered. */
    val verified: Boolean
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is CachedKey) return false
        return key.contentEquals(other.key) && verified == other.verified
    }

    override fun hashCode(): Int {
        var result = key.contentHashCode()
        result = 31 * result + verified.hashCode()
        return result
    }
}

/**
 * In-memory cache for public keys with TTL expiration.
 */
class PublicKeyCache(
    private val ttl: Duration = Duration.ofHours(24)
) {
    private val cache = mutableMapOf<String, CacheEntry>()
    private val mutex = Mutex()

    /** Store a public key for an address along with its verification status. */
    suspend fun store(address: String, key: ByteArray, verified: Boolean = false) {
        mutex.withLock {
            cache[address] = CacheEntry(
                key = key.copyOf(),
                verified = verified,
                expiresAt = Instant.now().plus(ttl)
            )
        }
    }

    /** Retrieve a public key for an address (returns null if expired). */
    suspend fun retrieve(address: String): ByteArray? {
        mutex.withLock {
            val entry = cache[address] ?: return null
            return if (entry.expiresAt.isAfter(Instant.now())) {
                entry.key.copyOf()
            } else {
                null
            }
        }
    }

    /** Retrieve a public key with its verification status (returns null if expired). */
    suspend fun retrieveVerified(address: String): CachedKey? {
        mutex.withLock {
            val entry = cache[address] ?: return null
            return if (entry.expiresAt.isAfter(Instant.now())) {
                CachedKey(entry.key.copyOf(), entry.verified)
            } else {
                null
            }
        }
    }

    /** Invalidate the cached key for an address. */
    suspend fun invalidate(address: String) {
        mutex.withLock {
            cache.remove(address)
        }
    }

    /** Clear all cached keys. */
    suspend fun clear() {
        mutex.withLock {
            cache.clear()
        }
    }

    /** Remove all expired entries. */
    suspend fun pruneExpired() {
        mutex.withLock {
            val now = Instant.now()
            cache.entries.removeIf { it.value.expiresAt.isBefore(now) || it.value.expiresAt == now }
        }
    }
}

// ============================================================================
// Encryption Key Storage
// ============================================================================

/**
 * Interface for storing encryption private keys.
 */
interface EncryptionKeyStorage {
    /** Store a private key for an address. */
    suspend fun store(privateKey: ByteArray, address: String, requireBiometric: Boolean = false)

    /** Retrieve a private key for an address. */
    suspend fun retrieve(address: String): ByteArray

    /** Check if a key exists for an address. */
    suspend fun hasKey(address: String): Boolean

    /** Delete a key for an address. */
    suspend fun delete(address: String)

    /** List all stored addresses. */
    suspend fun listStoredAddresses(): List<String>
}

/**
 * In-memory implementation of EncryptionKeyStorage (for testing).
 *
 * WARNING: This is NOT secure for production use. Keys are stored in memory
 * without encryption and are lost when the process exits.
 */
class InMemoryKeyStorage : EncryptionKeyStorage {
    private val keys = mutableMapOf<String, ByteArray>()
    private val mutex = Mutex()

    override suspend fun store(privateKey: ByteArray, address: String, requireBiometric: Boolean) {
        mutex.withLock {
            keys[address] = privateKey.copyOf()
        }
    }

    override suspend fun retrieve(address: String): ByteArray {
        mutex.withLock {
            return keys[address]?.copyOf()
                ?: throw AlgoChatException.KeyNotFound(address)
        }
    }

    override suspend fun hasKey(address: String): Boolean {
        mutex.withLock {
            return address in keys
        }
    }

    override suspend fun delete(address: String) {
        mutex.withLock {
            keys.remove(address)
        }
    }

    override suspend fun listStoredAddresses(): List<String> {
        mutex.withLock {
            return keys.keys.toList()
        }
    }
}

/**
 * File-backed implementation of [EncryptionKeyStorage] with at-rest encryption.
 *
 * Keys are encrypted with AES-256-GCM using a key derived from a passphrase via
 * PBKDF2WithHmacSHA256 (100,000 iterations). Each key is stored as a single file
 * at `~/.algochat/keys/<address>.key` with `0600` permissions.
 *
 * The on-disk format is a fixed 92-byte blob, interoperable with the Rust and
 * Python implementations:
 *
 * ```
 * salt        32 bytes  (PBKDF2 salt)
 * nonce       12 bytes  (AES-GCM nonce)
 * ciphertext  32 bytes  (encrypted 32-byte private key)
 * tag         16 bytes  (AES-GCM authentication tag)
 * ```
 */
class FileKeyStorage(
    private val passphrase: CharArray,
    baseDirectory: java.nio.file.Path = defaultBaseDirectory()
) : EncryptionKeyStorage {
    private val keysDirectory: java.nio.file.Path = baseDirectory.resolve("keys")
    private val mutex = Mutex()

    private companion object {
        const val SALT_SIZE = 32
        const val NONCE_SIZE = 12
        const val PLAINTEXT_SIZE = 32
        const val TAG_BITS = 128
        const val TAG_SIZE = TAG_BITS / 8
        const val BLOB_SIZE = SALT_SIZE + NONCE_SIZE + PLAINTEXT_SIZE + TAG_SIZE
        const val PBKDF2_ITERATIONS = 100_000
        const val DERIVED_KEY_BITS = 256

        fun defaultBaseDirectory(): java.nio.file.Path {
            return java.nio.file.Paths.get(System.getProperty("user.home"), ".algochat")
        }
    }

    private val secureRandom = java.security.SecureRandom()

    override suspend fun store(privateKey: ByteArray, address: String, requireBiometric: Boolean) {
        require(privateKey.size == PLAINTEXT_SIZE) {
            "Private key must be $PLAINTEXT_SIZE bytes, got ${privateKey.size}"
        }

        mutex.withLock {
            val salt = ByteArray(SALT_SIZE).also { secureRandom.nextBytes(it) }
            val nonce = ByteArray(NONCE_SIZE).also { secureRandom.nextBytes(it) }

            val secretKey = deriveKey(salt)
            val cipher = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(
                javax.crypto.Cipher.ENCRYPT_MODE,
                secretKey,
                javax.crypto.spec.GCMParameterSpec(TAG_BITS, nonce)
            )
            // JCA returns ciphertext || tag, matching the on-disk ciphertext + tag layout.
            val ciphertextAndTag = cipher.doFinal(privateKey)

            val blob = ByteArray(BLOB_SIZE)
            System.arraycopy(salt, 0, blob, 0, SALT_SIZE)
            System.arraycopy(nonce, 0, blob, SALT_SIZE, NONCE_SIZE)
            System.arraycopy(ciphertextAndTag, 0, blob, SALT_SIZE + NONCE_SIZE, ciphertextAndTag.size)

            try {
                ensureKeysDirectory()
                val target = keyPath(address)
                java.nio.file.Files.write(target, blob)
                restrictPermissions(target)
            } catch (e: Exception) {
                throw AlgoChatException.StorageFailed("Failed to write key for $address: ${e.message}")
            }
        }
    }

    override suspend fun retrieve(address: String): ByteArray {
        mutex.withLock {
            val target = keyPath(address)
            if (!java.nio.file.Files.exists(target)) {
                throw AlgoChatException.KeyNotFound(address)
            }

            val blob = try {
                java.nio.file.Files.readAllBytes(target)
            } catch (e: Exception) {
                throw AlgoChatException.StorageFailed("Failed to read key for $address: ${e.message}")
            }

            if (blob.size != BLOB_SIZE) {
                throw AlgoChatException.StorageFailed(
                    "Corrupt key file for $address: expected $BLOB_SIZE bytes, got ${blob.size}"
                )
            }

            val salt = blob.copyOfRange(0, SALT_SIZE)
            val nonce = blob.copyOfRange(SALT_SIZE, SALT_SIZE + NONCE_SIZE)
            val ciphertextAndTag = blob.copyOfRange(SALT_SIZE + NONCE_SIZE, BLOB_SIZE)

            val secretKey = deriveKey(salt)
            val cipher = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(
                javax.crypto.Cipher.DECRYPT_MODE,
                secretKey,
                javax.crypto.spec.GCMParameterSpec(TAG_BITS, nonce)
            )

            return try {
                cipher.doFinal(ciphertextAndTag)
            } catch (e: javax.crypto.AEADBadTagException) {
                throw AlgoChatException.DecryptionFailed("Wrong passphrase or corrupt key for $address")
            } catch (e: Exception) {
                throw AlgoChatException.DecryptionFailed("Failed to decrypt key for $address: ${e.message}")
            }
        }
    }

    override suspend fun hasKey(address: String): Boolean {
        mutex.withLock {
            return java.nio.file.Files.exists(keyPath(address))
        }
    }

    override suspend fun delete(address: String) {
        mutex.withLock {
            try {
                java.nio.file.Files.deleteIfExists(keyPath(address))
            } catch (e: Exception) {
                throw AlgoChatException.StorageFailed("Failed to delete key for $address: ${e.message}")
            }
        }
    }

    override suspend fun listStoredAddresses(): List<String> {
        mutex.withLock {
            if (!java.nio.file.Files.isDirectory(keysDirectory)) {
                return emptyList()
            }
            return java.nio.file.Files.list(keysDirectory).use { stream ->
                stream.map { it.fileName.toString() }
                    .filter { it.endsWith(".key") }
                    .map { it.removeSuffix(".key") }
                    .sorted()
                    .toList()
            }
        }
    }

    private fun deriveKey(salt: ByteArray): javax.crypto.spec.SecretKeySpec {
        val factory = javax.crypto.SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        val spec = javax.crypto.spec.PBEKeySpec(passphrase, salt, PBKDF2_ITERATIONS, DERIVED_KEY_BITS)
        val derived = try {
            factory.generateSecret(spec).encoded
        } finally {
            spec.clearPassword()
        }
        return javax.crypto.spec.SecretKeySpec(derived, "AES")
    }

    private fun keyPath(address: String): java.nio.file.Path = keysDirectory.resolve("$address.key")

    private fun ensureKeysDirectory() {
        if (!java.nio.file.Files.isDirectory(keysDirectory)) {
            java.nio.file.Files.createDirectories(keysDirectory)
        }
        restrictPermissions(keysDirectory)
    }

    private fun restrictPermissions(path: java.nio.file.Path) {
        // POSIX permissions: 0600 for files, 0700 for directories. Best-effort on
        // platforms without POSIX support (e.g. Windows).
        try {
            val isDir = java.nio.file.Files.isDirectory(path)
            val perms = if (isDir) "rwx------" else "rw-------"
            val attrs = java.nio.file.attribute.PosixFilePermissions.fromString(perms)
            java.nio.file.Files.setPosixFilePermissions(path, attrs)
        } catch (_: UnsupportedOperationException) {
            // Non-POSIX filesystem: rely on default permissions.
        } catch (_: Exception) {
            // Ignore; permission hardening is best-effort.
        }
    }
}
