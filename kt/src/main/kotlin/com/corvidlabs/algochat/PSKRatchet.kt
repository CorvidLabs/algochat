package com.corvidlabs.algochat

import org.bouncycastle.crypto.generators.HKDFBytesGenerator
import org.bouncycastle.crypto.params.HKDFParameters
import org.bouncycastle.crypto.digests.SHA256Digest
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Two-level PSK ratchet for deriving per-message keys.
 *
 * The ratchet uses a two-level hierarchy:
 * 1. Session PSK: derived from the initial PSK and a session index
 * 2. Position PSK: derived from the session PSK and a position within the session
 *
 * This allows efficient forward secrecy while limiting the amount of
 * key material that needs to be derived for each message.
 */
object PSKRatchet {

    /**
     * Derives a session PSK from the initial PSK and session index.
     *
     * @param initialPSK The initial pre-shared key (32 bytes)
     * @param sessionIndex The session index
     * @return 32-byte session PSK
     */
    fun deriveSessionPSK(initialPSK: ByteArray, sessionIndex: UInt): ByteArray {
        require(initialPSK.size == 32) { "Initial PSK must be 32 bytes, got " + initialPSK.size.toString() }

        val info = uintToBytes(sessionIndex)
        return hkdfDerive(initialPSK, PSKProtocol.SESSION_SALT, info)
    }

    /**
     * Derives a position PSK from a session PSK and position.
     *
     * @param sessionPSK The session PSK (32 bytes)
     * @param position The position within the session
     * @return 32-byte position PSK
     */
    fun derivePositionPSK(sessionPSK: ByteArray, position: UInt): ByteArray {
        require(sessionPSK.size == 32) { "Session PSK must be 32 bytes, got " + sessionPSK.size.toString() }

        val info = uintToBytes(position)
        return hkdfDerive(sessionPSK, PSKProtocol.POSITION_SALT, info)
    }

    /**
     * Derives the PSK at a specific counter value using the two-level ratchet.
     *
     * @param initialPSK The initial pre-shared key (32 bytes)
     * @param counter The ratchet counter
     * @return 32-byte derived PSK
     */
    fun derivePSKAtCounter(initialPSK: ByteArray, counter: UInt): ByteArray {
        val sessionIndex = counter / PSKProtocol.SESSION_SIZE.toUInt()
        val position = counter % PSKProtocol.SESSION_SIZE.toUInt()

        val sessionPSK = deriveSessionPSK(initialPSK, sessionIndex)
        return derivePositionPSK(sessionPSK, position)
    }

    /**
     * Derives a hybrid symmetric key combining X25519 shared secret with PSK.
     *
     * @param sharedSecret X25519 shared secret (32 bytes)
     * @param currentPSK Current PSK from the ratchet (32 bytes)
     * @param ephemeralPublicKey Ephemeral public key used as salt (32 bytes)
     * @param senderPublicKey Sender's public key (32 bytes)
     * @param recipientPublicKey Recipient's public key (32 bytes)
     * @return 32-byte hybrid symmetric key
     */
    fun deriveHybridSymmetricKey(
        sharedSecret: ByteArray,
        currentPSK: ByteArray,
        ephemeralPublicKey: ByteArray,
        senderPublicKey: ByteArray,
        recipientPublicKey: ByteArray
    ): ByteArray {
        val ikm = sharedSecret + currentPSK
        val info = PSKProtocol.HYBRID_KEY_INFO_PREFIX + senderPublicKey + recipientPublicKey
        return hkdfDerive(ikm, ephemeralPublicKey, info)
    }

    /**
     * Derives a sender key for bidirectional decryption with PSK.
     *
     * @param senderSharedSecret X25519 shared secret with sender (32 bytes)
     * @param currentPSK Current PSK from the ratchet (32 bytes)
     * @param ephemeralPublicKey Ephemeral public key used as salt (32 bytes)
     * @param senderPublicKey Sender's public key (32 bytes)
     * @return 32-byte sender key
     */
    fun deriveSenderKey(
        senderSharedSecret: ByteArray,
        currentPSK: ByteArray,
        ephemeralPublicKey: ByteArray,
        senderPublicKey: ByteArray
    ): ByteArray {
        val ikm = senderSharedSecret + currentPSK
        val info = PSKProtocol.SENDER_KEY_INFO_PREFIX + senderPublicKey
        return hkdfDerive(ikm, ephemeralPublicKey, info)
    }

    /**
     * Converts a UInt to 4-byte big-endian representation.
     */
    private fun uintToBytes(value: UInt): ByteArray {
        val buffer = ByteBuffer.allocate(4)
        buffer.order(ByteOrder.BIG_ENDIAN)
        buffer.putInt(value.toInt())
        return buffer.array()
    }

    /**
     * Performs HKDF-SHA256 key derivation.
     */
    private fun hkdfDerive(ikm: ByteArray, salt: ByteArray, info: ByteArray): ByteArray {
        val hkdf = HKDFBytesGenerator(SHA256Digest())
        hkdf.init(HKDFParameters(ikm, salt, info))

        val output = ByteArray(32)
        hkdf.generateBytes(output, 0, 32)
        return output
    }
}
