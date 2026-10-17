package com.corvidlabs.algochat

/**
 * Protocol constants for PSK (Pre-Shared Key) messaging v1.1.
 */
object PSKProtocol {
    /** Protocol version byte. */
    const val VERSION: Byte = 0x01

    /** Protocol ID byte for PSK messages. */
    const val PROTOCOL_ID: Byte = 0x02

    /** Size of the PSK envelope header in bytes. */
    const val HEADER_SIZE = 130

    /** Size of the authentication tag in bytes. */
    const val TAG_SIZE = 16

    /** Size of the encrypted sender key (32-byte key + 16-byte tag). */
    const val ENCRYPTED_SENDER_KEY_SIZE = 48

    /**
     * Maximum plaintext size in bytes.
     *
     * 4096-byte note, minus the 130-byte header and 16-byte Poly1305 tag.
     */
    const val MAX_PAYLOAD_SIZE = Protocol.MAX_NOTE_SIZE - HEADER_SIZE - TAG_SIZE

    /** Number of positions per session for the ratchet. */
    const val SESSION_SIZE = 100

    /** Window size for counter validation. */
    const val COUNTER_WINDOW = 200

    /** Size of the nonce in bytes. */
    const val NONCE_SIZE = 12

    /** Size of a public key in bytes. */
    const val PUBLIC_KEY_SIZE = 32

    /** Size of the ratchet counter in bytes. */
    const val COUNTER_SIZE = 4

    /** Salt for session PSK derivation. */
    val SESSION_SALT = "AlgoChat-PSK-Session".toByteArray()

    /** Salt for position PSK derivation. */
    val POSITION_SALT = "AlgoChat-PSK-Position".toByteArray()

    /** Info prefix for hybrid symmetric key derivation. */
    val HYBRID_KEY_INFO_PREFIX = "AlgoChatV1-PSK".toByteArray()

    /** Info prefix for sender key derivation. */
    val SENDER_KEY_INFO_PREFIX = "AlgoChatV1-PSK-SenderKey".toByteArray()
}

/**
 * PSK message envelope with ratchet counter.
 *
 * Wire format (130-byte header + ciphertext):
 * - [0]       version (0x01)
 * - [1]       protocolId (0x02)
 * - [2..5]    ratchetCounter (4 bytes, big-endian)
 * - [6..37]   senderPublicKey (32 bytes)
 * - [38..69]  ephemeralPublicKey (32 bytes)
 * - [70..81]  nonce (12 bytes)
 * - [82..129] encryptedSenderKey (48 bytes)
 * - [130..]   ciphertext + 16-byte tag
 */
data class PSKEnvelope(
    /** Ratchet counter for PSK derivation. */
    val ratchetCounter: UInt,
    /** Sender's X25519 public key (32 bytes). */
    val senderPublicKey: ByteArray,
    /** Ephemeral X25519 public key (32 bytes). */
    val ephemeralPublicKey: ByteArray,
    /** Nonce for encryption (12 bytes). */
    val nonce: ByteArray,
    /** Encrypted symmetric key for sender decryption (48 bytes). */
    val encryptedSenderKey: ByteArray,
    /** Encrypted message ciphertext (variable length). */
    val ciphertext: ByteArray
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false

        other as PSKEnvelope

        if (ratchetCounter != other.ratchetCounter) return false
        if (!senderPublicKey.contentEquals(other.senderPublicKey)) return false
        if (!ephemeralPublicKey.contentEquals(other.ephemeralPublicKey)) return false
        if (!nonce.contentEquals(other.nonce)) return false
        if (!encryptedSenderKey.contentEquals(other.encryptedSenderKey)) return false
        if (!ciphertext.contentEquals(other.ciphertext)) return false

        return true
    }

    override fun hashCode(): Int {
        var result = ratchetCounter.hashCode()
        result = 31 * result + senderPublicKey.contentHashCode()
        result = 31 * result + ephemeralPublicKey.contentHashCode()
        result = 31 * result + nonce.contentHashCode()
        result = 31 * result + encryptedSenderKey.contentHashCode()
        result = 31 * result + ciphertext.contentHashCode()
        return result
    }
}
