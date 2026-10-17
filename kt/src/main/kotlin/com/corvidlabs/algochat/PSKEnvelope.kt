package com.corvidlabs.algochat

import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Encoding and decoding for PSK message envelopes.
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
object PSKEnvelopeCodec {

    /**
     * Encodes a PSK envelope to bytes.
     *
     * @param envelope The PSK envelope to encode
     * @return Encoded byte array
     */
    fun encode(envelope: PSKEnvelope): ByteArray {
        val buffer = ByteBuffer.allocate(PSKProtocol.HEADER_SIZE + envelope.ciphertext.size)
        buffer.order(ByteOrder.BIG_ENDIAN)

        buffer.put(PSKProtocol.VERSION)
        buffer.put(PSKProtocol.PROTOCOL_ID)
        buffer.putInt(envelope.ratchetCounter.toInt())
        buffer.put(envelope.senderPublicKey)
        buffer.put(envelope.ephemeralPublicKey)
        buffer.put(envelope.nonce)
        buffer.put(envelope.encryptedSenderKey)
        buffer.put(envelope.ciphertext)

        return buffer.array()
    }

    /**
     * Decodes bytes into a PSK envelope.
     *
     * @param data Encoded envelope bytes
     * @return Decoded PSKEnvelope
     * @throws AlgoChatException if data is invalid
     */
    fun decode(data: ByteArray): PSKEnvelope {
        if (data.size < PSKProtocol.HEADER_SIZE) {
            throw AlgoChatException.InvalidEnvelope(
                "PSK data too short: " + data.size.toString() + " bytes (minimum " + PSKProtocol.HEADER_SIZE.toString() + ")"
            )
        }

        val version = data[0]
        val protocolId = data[1]

        if (version != PSKProtocol.VERSION) {
            throw AlgoChatException.InvalidEnvelope("Unknown PSK version: " + version.toString())
        }

        if (protocolId != PSKProtocol.PROTOCOL_ID) {
            throw AlgoChatException.InvalidEnvelope("Unknown PSK protocol ID: " + protocolId.toString())
        }

        val buffer = ByteBuffer.wrap(data)
        buffer.order(ByteOrder.BIG_ENDIAN)

        // Skip version and protocolId (2 bytes)
        buffer.position(2)

        val ratchetCounter = buffer.getInt().toUInt()

        val senderPublicKey = ByteArray(PSKProtocol.PUBLIC_KEY_SIZE)
        buffer.get(senderPublicKey)

        val ephemeralPublicKey = ByteArray(PSKProtocol.PUBLIC_KEY_SIZE)
        buffer.get(ephemeralPublicKey)

        val nonce = ByteArray(PSKProtocol.NONCE_SIZE)
        buffer.get(nonce)

        val encryptedSenderKey = ByteArray(PSKProtocol.ENCRYPTED_SENDER_KEY_SIZE)
        buffer.get(encryptedSenderKey)

        val ciphertext = ByteArray(data.size - PSKProtocol.HEADER_SIZE)
        buffer.get(ciphertext)

        return PSKEnvelope(
            ratchetCounter = ratchetCounter,
            senderPublicKey = senderPublicKey,
            ephemeralPublicKey = ephemeralPublicKey,
            nonce = nonce,
            encryptedSenderKey = encryptedSenderKey,
            ciphertext = ciphertext
        )
    }
}

/**
 * Check if data looks like a valid PSK message envelope.
 *
 * @param data Bytes to check
 * @return True if data appears to be a valid PSK envelope
 */
fun isPSKMessage(data: ByteArray): Boolean {
    if (data.size < PSKProtocol.HEADER_SIZE) {
        return false
    }
    return data[0] == PSKProtocol.VERSION && data[1] == PSKProtocol.PROTOCOL_ID
}
