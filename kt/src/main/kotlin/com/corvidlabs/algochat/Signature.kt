package com.corvidlabs.algochat

import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters
import org.bouncycastle.crypto.params.Ed25519PublicKeyParameters
import org.bouncycastle.crypto.signers.Ed25519Signer
import java.security.MessageDigest

/**
 * Signature verification for AlgoChat encryption keys.
 *
 * This object provides functions to sign encryption public keys with an
 * Algorand account's Ed25519 key, and verify those signatures. This prevents
 * key substitution attacks by proving key ownership.
 */
object Signature {
    /** Size of an Ed25519 signature (64 bytes). */
    const val SIGNATURE_SIZE = 64

    /**
     * Signs an encryption public key with an Ed25519 signing key.
     *
     * This creates a cryptographic proof that the encryption key belongs to
     * the holder of the Ed25519 private key (Algorand account).
     *
     * @param encryptionPublicKey The X25519 public key to sign (32 bytes)
     * @param signingKey The Ed25519 private key (from Algorand account)
     * @return The Ed25519 signature (64 bytes)
     * @throws IllegalArgumentException if encryptionPublicKey is not 32 bytes
     */
    fun signEncryptionKey(
        encryptionPublicKey: ByteArray,
        signingKey: Ed25519PrivateKeyParameters
    ): ByteArray {
        require(encryptionPublicKey.size == 32) {
            "Encryption public key must be 32 bytes, got ${encryptionPublicKey.size}"
        }

        val signer = Ed25519Signer()
        signer.init(true, signingKey)
        signer.update(encryptionPublicKey, 0, encryptionPublicKey.size)
        return signer.generateSignature()
    }

    /**
     * Verifies that an encryption public key was signed by an Ed25519 key.
     *
     * @param encryptionPublicKey The X25519 public key (32 bytes)
     * @param verifyingKey The Ed25519 public key (from Algorand address)
     * @param signature The Ed25519 signature to verify (64 bytes)
     * @return true if the signature is valid
     * @throws IllegalArgumentException if inputs have invalid lengths
     */
    fun verifyEncryptionKey(
        encryptionPublicKey: ByteArray,
        verifyingKey: Ed25519PublicKeyParameters,
        signature: ByteArray
    ): Boolean {
        require(encryptionPublicKey.size == 32) {
            "Encryption public key must be 32 bytes, got ${encryptionPublicKey.size}"
        }
        require(signature.size == SIGNATURE_SIZE) {
            "Signature must be $SIGNATURE_SIZE bytes, got ${signature.size}"
        }

        return try {
            val verifier = Ed25519Signer()
            verifier.init(false, verifyingKey)
            verifier.update(encryptionPublicKey, 0, encryptionPublicKey.size)
            verifier.verifySignature(signature)
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Verifies an encryption key using raw Ed25519 public key bytes.
     *
     * @param encryptionPublicKey The X25519 public key (32 bytes)
     * @param ed25519PublicKey The Ed25519 public key bytes (32 bytes)
     * @param signature The Ed25519 signature (64 bytes)
     * @return true if the signature is valid
     * @throws IllegalArgumentException if inputs have invalid lengths
     */
    fun verifyEncryptionKeyBytes(
        encryptionPublicKey: ByteArray,
        ed25519PublicKey: ByteArray,
        signature: ByteArray
    ): Boolean {
        require(ed25519PublicKey.size == 32) {
            "Ed25519 public key must be 32 bytes, got ${ed25519PublicKey.size}"
        }

        val verifyingKey = Ed25519PublicKeyParameters(ed25519PublicKey, 0)
        return verifyEncryptionKey(encryptionPublicKey, verifyingKey, signature)
    }

    /**
     * Generates a human-readable fingerprint for an encryption public key.
     *
     * The fingerprint is a truncated SHA-256 hash formatted for easy comparison.
     *
     * @param publicKey The encryption public key (any length, typically 32 bytes)
     * @return A fingerprint string like "A7B3 C9D1 E5F2 8A4B"
     */
    fun fingerprint(publicKey: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val hash = digest.digest(publicKey)
        return hash.take(8)
            .joinToString("") { "%02X".format(it) }
            .chunked(4)
            .joinToString(" ")
    }
}
