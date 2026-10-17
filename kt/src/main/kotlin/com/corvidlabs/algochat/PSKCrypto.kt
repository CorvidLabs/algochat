package com.corvidlabs.algochat

import org.bouncycastle.crypto.modes.ChaCha20Poly1305
import org.bouncycastle.crypto.params.AEADParameters
import org.bouncycastle.crypto.params.KeyParameter
import org.bouncycastle.crypto.params.X25519PrivateKeyParameters
import org.bouncycastle.crypto.params.X25519PublicKeyParameters
import java.security.SecureRandom

/**
 * Encryption and decryption for PSK (Pre-Shared Key) messages.
 *
 * This extends the standard AlgoChat protocol with an additional PSK layer,
 * providing hybrid security combining X25519 key agreement with a pre-shared
 * symmetric key via a two-level ratchet.
 */
object PSKCrypto {
    private val secureRandom = SecureRandom()

    /**
     * Encrypt a message using the PSK protocol.
     *
     * @param plaintext Message to encrypt
     * @param senderPrivateKey Sender's X25519 private key
     * @param senderPublicKey Sender's X25519 public key
     * @param recipientPublicKey Recipient's X25519 public key
     * @param currentPSK Current PSK from the ratchet (32 bytes)
     * @param ratchetCounter Current ratchet counter value
     * @return PSKEnvelope containing the encrypted message
     */
    fun encryptMessage(
        plaintext: String,
        senderPrivateKey: X25519PrivateKeyParameters,
        senderPublicKey: X25519PublicKeyParameters,
        recipientPublicKey: X25519PublicKeyParameters,
        currentPSK: ByteArray,
        ratchetCounter: UInt
    ): PSKEnvelope {
        val messageBytes = plaintext.toByteArray(Charsets.UTF_8)

        if (messageBytes.size > PSKProtocol.MAX_PAYLOAD_SIZE) {
            throw AlgoChatException.EncryptionFailed(
                "Message too large: ${messageBytes.size} bytes (max ${PSKProtocol.MAX_PAYLOAD_SIZE})"
            )
        }

        // Generate ephemeral key pair for this message
        val ephemeralKeyPair = Keys.generateEphemeralKeyPair()

        // Get raw public key bytes
        val senderPubBytes = Keys.publicKeyToBytes(senderPublicKey)
        val recipientPubBytes = Keys.publicKeyToBytes(recipientPublicKey)
        val ephemeralPubBytes = Keys.publicKeyToBytes(ephemeralKeyPair.publicKey)

        // X25519 ECDH: ephemeral + recipient
        val sharedSecret = Keys.x25519Ecdh(ephemeralKeyPair.privateKey, recipientPublicKey)

        // Derive hybrid symmetric key (X25519 shared secret + PSK)
        val symmetricKey = PSKRatchet.deriveHybridSymmetricKey(
            sharedSecret, currentPSK, ephemeralPubBytes, senderPubBytes, recipientPubBytes
        )

        // Generate random nonce
        val nonce = ByteArray(PSKProtocol.NONCE_SIZE)
        secureRandom.nextBytes(nonce)

        // Encrypt message
        val ciphertext = chaCha20Poly1305Encrypt(symmetricKey, nonce, messageBytes)

        // Encrypt the symmetric key for sender (bidirectional decryption)
        val senderSharedSecret = Keys.x25519Ecdh(ephemeralKeyPair.privateKey, senderPublicKey)
        val senderEncryptionKey = PSKRatchet.deriveSenderKey(
            senderSharedSecret, currentPSK, ephemeralPubBytes, senderPubBytes
        )
        val encryptedSenderKey = chaCha20Poly1305Encrypt(senderEncryptionKey, nonce, symmetricKey)

        return PSKEnvelope(
            ratchetCounter = ratchetCounter,
            senderPublicKey = senderPubBytes,
            ephemeralPublicKey = ephemeralPubBytes,
            nonce = nonce,
            encryptedSenderKey = encryptedSenderKey,
            ciphertext = ciphertext
        )
    }

    /**
     * Encrypt a reply message using the PSK protocol.
     *
     * @param text Reply message text
     * @param replyToTxid Transaction ID of the message being replied to
     * @param replyToPreview Preview text of the original message (optional)
     * @param senderPrivateKey Sender's X25519 private key
     * @param senderPublicKey Sender's X25519 public key
     * @param recipientPublicKey Recipient's X25519 public key
     * @param currentPSK Current PSK from the ratchet (32 bytes)
     * @param ratchetCounter Current ratchet counter value
     * @return PSKEnvelope containing the encrypted reply
     */
    fun encryptReply(
        text: String,
        replyToTxid: String,
        replyToPreview: String? = null,
        senderPrivateKey: X25519PrivateKeyParameters,
        senderPublicKey: X25519PublicKeyParameters,
        recipientPublicKey: X25519PublicKeyParameters,
        currentPSK: ByteArray,
        ratchetCounter: UInt
    ): PSKEnvelope {
        val payload = String(
            MessagePayloadCodec.encode(text, replyToTxid, replyToPreview),
            Charsets.UTF_8
        )
        return encryptMessage(payload, senderPrivateKey, senderPublicKey, recipientPublicKey, currentPSK, ratchetCounter)
    }

    /**
     * Decrypt a PSK message from an envelope.
     *
     * @param envelope The encrypted PSK envelope
     * @param myPrivateKey Our X25519 private key
     * @param myPublicKey Our X25519 public key
     * @param currentPSK Current PSK from the ratchet (32 bytes)
     * @return DecryptedContent if successful, null if it's a key-publish message
     */
    fun decryptMessage(
        envelope: PSKEnvelope,
        myPrivateKey: X25519PrivateKeyParameters,
        myPublicKey: X25519PublicKeyParameters,
        currentPSK: ByteArray
    ): DecryptedContent? {
        val myPubBytes = Keys.publicKeyToBytes(myPublicKey)
        val weAreSender = myPubBytes.contentEquals(envelope.senderPublicKey)

        val plaintext = if (weAreSender) {
            decryptAsSender(envelope, myPrivateKey, myPubBytes, currentPSK)
        } else {
            decryptAsRecipient(envelope, myPrivateKey, myPubBytes, currentPSK)
        }

        if (MessagePayloadCodec.isKeyPublish(plaintext)) {
            return null
        }

        return MessagePayloadCodec.decode(plaintext)
    }

    private fun decryptAsRecipient(
        envelope: PSKEnvelope,
        recipientPrivateKey: X25519PrivateKeyParameters,
        recipientPubBytes: ByteArray,
        currentPSK: ByteArray
    ): ByteArray {
        val ephemeralPublic = Keys.publicKeyFromBytes(envelope.ephemeralPublicKey)

        val sharedSecret = Keys.x25519Ecdh(recipientPrivateKey, ephemeralPublic)
        val symmetricKey = PSKRatchet.deriveHybridSymmetricKey(
            sharedSecret, currentPSK, envelope.ephemeralPublicKey,
            envelope.senderPublicKey, recipientPubBytes
        )

        return chaCha20Poly1305Decrypt(symmetricKey, envelope.nonce, envelope.ciphertext)
    }

    private fun decryptAsSender(
        envelope: PSKEnvelope,
        senderPrivateKey: X25519PrivateKeyParameters,
        senderPubBytes: ByteArray,
        currentPSK: ByteArray
    ): ByteArray {
        val ephemeralPublic = Keys.publicKeyFromBytes(envelope.ephemeralPublicKey)

        // First, recover the symmetric key
        val sharedSecret = Keys.x25519Ecdh(senderPrivateKey, ephemeralPublic)
        val senderDecryptionKey = PSKRatchet.deriveSenderKey(
            sharedSecret, currentPSK, envelope.ephemeralPublicKey, senderPubBytes
        )
        val symmetricKey = chaCha20Poly1305Decrypt(
            senderDecryptionKey, envelope.nonce, envelope.encryptedSenderKey
        )

        // Now decrypt the message
        return chaCha20Poly1305Decrypt(symmetricKey, envelope.nonce, envelope.ciphertext)
    }

    private fun chaCha20Poly1305Encrypt(key: ByteArray, nonce: ByteArray, plaintext: ByteArray): ByteArray {
        val cipher = ChaCha20Poly1305()
        val params = AEADParameters(KeyParameter(key), 128, nonce, null)
        cipher.init(true, params)

        val output = ByteArray(cipher.getOutputSize(plaintext.size))
        val len = cipher.processBytes(plaintext, 0, plaintext.size, output, 0)
        cipher.doFinal(output, len)

        return output
    }

    private fun chaCha20Poly1305Decrypt(key: ByteArray, nonce: ByteArray, ciphertext: ByteArray): ByteArray {
        val cipher = ChaCha20Poly1305()
        val params = AEADParameters(KeyParameter(key), 128, nonce, null)
        cipher.init(false, params)

        val output = ByteArray(cipher.getOutputSize(ciphertext.size))
        var len = cipher.processBytes(ciphertext, 0, ciphertext.size, output, 0)
        len += cipher.doFinal(output, len)

        return output.copyOf(len)
    }

}
