package com.corvidlabs.algochat

import org.bouncycastle.crypto.agreement.X25519Agreement
import org.bouncycastle.crypto.generators.HKDFBytesGenerator
import org.bouncycastle.crypto.params.HKDFParameters
import org.bouncycastle.crypto.params.X25519PrivateKeyParameters
import org.bouncycastle.crypto.params.X25519PublicKeyParameters
import org.bouncycastle.crypto.digests.SHA256Digest
import java.security.SecureRandom

/**
 * X25519 key pair for AlgoChat.
 */
data class KeyPair(
    val privateKey: X25519PrivateKeyParameters,
    val publicKey: X25519PublicKeyParameters
)

/**
 * Key derivation and management for AlgoChat.
 */
object Keys {
    private val secureRandom = SecureRandom()

    /**
     * Derive X25519 key pair from a 32-byte seed using HKDF-SHA256.
     *
     * @param seed 32-byte seed (e.g., from Algorand account secret key)
     * @return KeyPair containing private and public keys
     * @throws AlgoChatException if seed is not 32 bytes
     */
    fun deriveKeysFromSeed(seed: ByteArray): KeyPair {
        if (seed.size != 32) {
            throw AlgoChatException.KeyDerivationFailed("Seed must be 32 bytes, got ${seed.size}")
        }

        // Derive key material using HKDF
        val hkdf = HKDFBytesGenerator(SHA256Digest())
        hkdf.init(HKDFParameters(seed, Protocol.KEY_DERIVATION_SALT, Protocol.KEY_DERIVATION_INFO))

        val derivedKey = ByteArray(32)
        hkdf.generateBytes(derivedKey, 0, 32)

        // Create X25519 key pair
        val privateKey = X25519PrivateKeyParameters(derivedKey, 0)
        val publicKey = privateKey.generatePublicKey()

        return KeyPair(privateKey, publicKey)
    }

    /**
     * Generate a random ephemeral X25519 key pair for message encryption.
     *
     * @return KeyPair containing private and public keys
     */
    fun generateEphemeralKeyPair(): KeyPair {
        val privateKeyBytes = ByteArray(32)
        secureRandom.nextBytes(privateKeyBytes)

        val privateKey = X25519PrivateKeyParameters(privateKeyBytes, 0)
        val publicKey = privateKey.generatePublicKey()

        return KeyPair(privateKey, publicKey)
    }

    /**
     * Perform X25519 ECDH key exchange.
     *
     * @param privateKey Our private key
     * @param publicKey Their public key
     * @return 32-byte shared secret
     */
    fun x25519Ecdh(privateKey: X25519PrivateKeyParameters, publicKey: X25519PublicKeyParameters): ByteArray {
        val agreement = X25519Agreement()
        agreement.init(privateKey)

        val sharedSecret = ByteArray(32)
        agreement.calculateAgreement(publicKey, sharedSecret, 0)

        return sharedSecret
    }

    /**
     * Convert public key to raw bytes.
     */
    fun publicKeyToBytes(publicKey: X25519PublicKeyParameters): ByteArray {
        return publicKey.encoded
    }

    /**
     * Create public key from raw bytes.
     */
    fun publicKeyFromBytes(data: ByteArray): X25519PublicKeyParameters {
        return X25519PublicKeyParameters(data, 0)
    }
}
