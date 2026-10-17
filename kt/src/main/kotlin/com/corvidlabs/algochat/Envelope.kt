package com.corvidlabs.algochat

import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * AlgoChat message envelope.
 */
data class ChatEnvelope(
    /** Protocol version. */
    val version: Byte,
    /** Protocol ID. */
    val protocolId: Byte,
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
    /**
     * Encode the envelope to bytes.
     *
     * Format (126-byte header + ciphertext):
     * - [0]      version (0x01)
     * - [1]      protocolId (0x01)
     * - [2-33]   senderPublicKey (32 bytes)
     * - [34-65]  ephemeralPublicKey (32 bytes)
     * - [66-77]  nonce (12 bytes)
     * - [78-125] encryptedSenderKey (48 bytes)
     * - [126+]   ciphertext (variable)
     */
    fun encode(): ByteArray {
        val buffer = ByteBuffer.allocate(Protocol.HEADER_SIZE + ciphertext.size)
        buffer.order(ByteOrder.BIG_ENDIAN)

        buffer.put(version)
        buffer.put(protocolId)
        buffer.put(senderPublicKey)
        buffer.put(ephemeralPublicKey)
        buffer.put(nonce)
        buffer.put(encryptedSenderKey)
        buffer.put(ciphertext)

        return buffer.array()
    }

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false

        other as ChatEnvelope

        if (version != other.version) return false
        if (protocolId != other.protocolId) return false
        if (!senderPublicKey.contentEquals(other.senderPublicKey)) return false
        if (!ephemeralPublicKey.contentEquals(other.ephemeralPublicKey)) return false
        if (!nonce.contentEquals(other.nonce)) return false
        if (!encryptedSenderKey.contentEquals(other.encryptedSenderKey)) return false
        if (!ciphertext.contentEquals(other.ciphertext)) return false

        return true
    }

    override fun hashCode(): Int {
        var result = version.toInt()
        result = 31 * result + protocolId
        result = 31 * result + senderPublicKey.contentHashCode()
        result = 31 * result + ephemeralPublicKey.contentHashCode()
        result = 31 * result + nonce.contentHashCode()
        result = 31 * result + encryptedSenderKey.contentHashCode()
        result = 31 * result + ciphertext.contentHashCode()
        return result
    }

    companion object {
        /**
         * Decode bytes into an envelope.
         *
         * @param data Encoded envelope bytes
         * @return Decoded ChatEnvelope
         * @throws AlgoChatException if data is invalid
         */
        fun decode(data: ByteArray): ChatEnvelope {
            if (data.size < Protocol.HEADER_SIZE) {
                throw AlgoChatException.InvalidEnvelope("Data too short: ${data.size} bytes (minimum ${Protocol.HEADER_SIZE})")
            }

            val version = data[0]
            val protocolId = data[1]

            if (version != Protocol.VERSION) {
                throw AlgoChatException.InvalidEnvelope("Unknown version: $version")
            }

            if (protocolId != Protocol.PROTOCOL_ID) {
                throw AlgoChatException.InvalidEnvelope("Unknown protocol ID: $protocolId")
            }

            var offset = 2

            val senderPublicKey = data.copyOfRange(offset, offset + Protocol.PUBLIC_KEY_SIZE)
            offset += Protocol.PUBLIC_KEY_SIZE

            val ephemeralPublicKey = data.copyOfRange(offset, offset + Protocol.PUBLIC_KEY_SIZE)
            offset += Protocol.PUBLIC_KEY_SIZE

            val nonce = data.copyOfRange(offset, offset + Protocol.NONCE_SIZE)
            offset += Protocol.NONCE_SIZE

            val encryptedSenderKey = data.copyOfRange(offset, offset + Protocol.ENCRYPTED_SENDER_KEY_SIZE)
            offset += Protocol.ENCRYPTED_SENDER_KEY_SIZE

            val ciphertext = data.copyOfRange(offset, data.size)

            return ChatEnvelope(
                version = version,
                protocolId = protocolId,
                senderPublicKey = senderPublicKey,
                ephemeralPublicKey = ephemeralPublicKey,
                nonce = nonce,
                encryptedSenderKey = encryptedSenderKey,
                ciphertext = ciphertext
            )
        }
    }
}

/**
 * Check if data looks like a valid AlgoChat envelope.
 *
 * @param data Bytes to check
 * @return True if data appears to be a valid envelope
 */
fun isChatMessage(data: ByteArray): Boolean {
    if (data.size < Protocol.HEADER_SIZE) {
        return false
    }
    return data[0] == Protocol.VERSION && data[1] == Protocol.PROTOCOL_ID
}
