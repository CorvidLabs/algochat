package com.corvidlabs.algochat

import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.security.SecureRandom
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class SignatureTest {
    companion object {
        private val secureRandom = SecureRandom()

        /** Generate a random Ed25519 key pair for testing. */
        fun generateEd25519KeyPair(): Ed25519PrivateKeyParameters {
            val seed = ByteArray(32)
            secureRandom.nextBytes(seed)
            return Ed25519PrivateKeyParameters(seed, 0)
        }

        /** Generate a random 32-byte encryption key for testing. */
        fun randomEncryptionKey(): ByteArray {
            val key = ByteArray(32)
            secureRandom.nextBytes(key)
            return key
        }
    }

    // ========================================================================
    // Sign / Verify Round-Trip Tests
    // ========================================================================

    @Test
    fun `sign and verify round-trip succeeds`() {
        val signingKey = generateEd25519KeyPair()
        val verifyingKey = signingKey.generatePublicKey()
        val encryptionKey = randomEncryptionKey()

        val signature = Signature.signEncryptionKey(encryptionKey, signingKey)

        assertEquals(Signature.SIGNATURE_SIZE, signature.size)
        assertTrue(Signature.verifyEncryptionKey(encryptionKey, verifyingKey, signature))
    }

    @Test
    fun `sign and verify multiple times with same keys`() {
        val signingKey = generateEd25519KeyPair()
        val verifyingKey = signingKey.generatePublicKey()
        val encryptionKey = randomEncryptionKey()

        // Ed25519 is deterministic, so the same inputs produce the same signature
        val sig1 = Signature.signEncryptionKey(encryptionKey, signingKey)
        val sig2 = Signature.signEncryptionKey(encryptionKey, signingKey)

        assertTrue(sig1.contentEquals(sig2))
        assertTrue(Signature.verifyEncryptionKey(encryptionKey, verifyingKey, sig1))
        assertTrue(Signature.verifyEncryptionKey(encryptionKey, verifyingKey, sig2))
    }

    @Test
    fun `sign different encryption keys produces different signatures`() {
        val signingKey = generateEd25519KeyPair()
        val encKey1 = randomEncryptionKey()
        val encKey2 = randomEncryptionKey()

        val sig1 = Signature.signEncryptionKey(encKey1, signingKey)
        val sig2 = Signature.signEncryptionKey(encKey2, signingKey)

        assertFalse(sig1.contentEquals(sig2))
    }

    // ========================================================================
    // Wrong Signing Key Tests
    // ========================================================================

    @Test
    fun `wrong signing key fails verification`() {
        val signingKey = generateEd25519KeyPair()
        val wrongKey = generateEd25519KeyPair()
        val wrongVerifyingKey = wrongKey.generatePublicKey()
        val encryptionKey = randomEncryptionKey()

        val signature = Signature.signEncryptionKey(encryptionKey, signingKey)

        assertFalse(Signature.verifyEncryptionKey(encryptionKey, wrongVerifyingKey, signature))
    }

    // ========================================================================
    // Wrong Message (Different Encryption Key) Tests
    // ========================================================================

    @Test
    fun `wrong encryption key fails verification`() {
        val signingKey = generateEd25519KeyPair()
        val verifyingKey = signingKey.generatePublicKey()
        val encryptionKey = randomEncryptionKey()
        val differentEncryptionKey = randomEncryptionKey()

        val signature = Signature.signEncryptionKey(encryptionKey, signingKey)

        assertFalse(Signature.verifyEncryptionKey(differentEncryptionKey, verifyingKey, signature))
    }

    // ========================================================================
    // Fingerprint Tests
    // ========================================================================

    @Test
    fun `fingerprint format is XXXX XXXX XXXX XXXX`() {
        val key = randomEncryptionKey()
        val fp = Signature.fingerprint(key)

        // Should be 4 groups of 4 hex chars separated by spaces
        val pattern = Regex("^[0-9A-F]{4} [0-9A-F]{4} [0-9A-F]{4} [0-9A-F]{4}$")
        assertTrue(pattern.matches(fp), "Fingerprint '$fp' does not match expected format XXXX XXXX XXXX XXXX")
    }

    @Test
    fun `fingerprint format with multiple keys`() {
        val pattern = Regex("^[0-9A-F]{4} [0-9A-F]{4} [0-9A-F]{4} [0-9A-F]{4}$")

        repeat(10) {
            val key = randomEncryptionKey()
            val fp = Signature.fingerprint(key)
            assertTrue(pattern.matches(fp), "Fingerprint '$fp' does not match expected format")
        }
    }

    @Test
    fun `fingerprint is deterministic`() {
        val key = randomEncryptionKey()

        val fp1 = Signature.fingerprint(key)
        val fp2 = Signature.fingerprint(key)

        assertEquals(fp1, fp2)
    }

    @Test
    fun `fingerprint same key bytes produce same fingerprint`() {
        val keyBytes = randomEncryptionKey()
        val keyCopy = keyBytes.copyOf()

        assertEquals(Signature.fingerprint(keyBytes), Signature.fingerprint(keyCopy))
    }

    @Test
    fun `fingerprint different keys produce different fingerprints`() {
        val key1 = randomEncryptionKey()
        val key2 = randomEncryptionKey()

        assertNotEquals(Signature.fingerprint(key1), Signature.fingerprint(key2))
    }

    @Test
    fun `fingerprint works with empty input`() {
        val fp = Signature.fingerprint(byteArrayOf())
        val pattern = Regex("^[0-9A-F]{4} [0-9A-F]{4} [0-9A-F]{4} [0-9A-F]{4}$")
        assertTrue(pattern.matches(fp), "Fingerprint of empty input '$fp' should still match format")
    }

    @Test
    fun `fingerprint works with single byte input`() {
        val fp = Signature.fingerprint(byteArrayOf(0x42))
        val pattern = Regex("^[0-9A-F]{4} [0-9A-F]{4} [0-9A-F]{4} [0-9A-F]{4}$")
        assertTrue(pattern.matches(fp), "Fingerprint of single byte '$fp' should match format")
    }

    // ========================================================================
    // Invalid Input Length Tests
    // ========================================================================

    @Test
    fun `signEncryptionKey rejects wrong encryption key size`() {
        val signingKey = generateEd25519KeyPair()

        assertThrows<IllegalArgumentException> {
            Signature.signEncryptionKey(ByteArray(16), signingKey)
        }

        assertThrows<IllegalArgumentException> {
            Signature.signEncryptionKey(ByteArray(0), signingKey)
        }

        assertThrows<IllegalArgumentException> {
            Signature.signEncryptionKey(ByteArray(33), signingKey)
        }

        assertThrows<IllegalArgumentException> {
            Signature.signEncryptionKey(ByteArray(64), signingKey)
        }
    }

    @Test
    fun `verifyEncryptionKey rejects wrong encryption key size`() {
        val signingKey = generateEd25519KeyPair()
        val verifyingKey = signingKey.generatePublicKey()
        val validSignature = ByteArray(Signature.SIGNATURE_SIZE)

        assertThrows<IllegalArgumentException> {
            Signature.verifyEncryptionKey(ByteArray(16), verifyingKey, validSignature)
        }

        assertThrows<IllegalArgumentException> {
            Signature.verifyEncryptionKey(ByteArray(0), verifyingKey, validSignature)
        }

        assertThrows<IllegalArgumentException> {
            Signature.verifyEncryptionKey(ByteArray(64), verifyingKey, validSignature)
        }
    }

    @Test
    fun `verifyEncryptionKey rejects wrong signature size`() {
        val signingKey = generateEd25519KeyPair()
        val verifyingKey = signingKey.generatePublicKey()
        val encryptionKey = randomEncryptionKey()

        assertThrows<IllegalArgumentException> {
            Signature.verifyEncryptionKey(encryptionKey, verifyingKey, ByteArray(32))
        }

        assertThrows<IllegalArgumentException> {
            Signature.verifyEncryptionKey(encryptionKey, verifyingKey, ByteArray(0))
        }

        assertThrows<IllegalArgumentException> {
            Signature.verifyEncryptionKey(encryptionKey, verifyingKey, ByteArray(128))
        }
    }

    @Test
    fun `verifyEncryptionKey returns false for corrupted signature`() {
        val signingKey = generateEd25519KeyPair()
        val verifyingKey = signingKey.generatePublicKey()
        val encryptionKey = randomEncryptionKey()

        val signature = Signature.signEncryptionKey(encryptionKey, signingKey)

        // Corrupt one byte of the signature
        val corruptedSignature = signature.copyOf()
        corruptedSignature[0] = (corruptedSignature[0].toInt() xor 0xFF).toByte()

        assertFalse(Signature.verifyEncryptionKey(encryptionKey, verifyingKey, corruptedSignature))
    }

    // ========================================================================
    // verifyEncryptionKeyBytes Convenience Method Tests
    // ========================================================================

    @Test
    fun `verifyEncryptionKeyBytes round-trip succeeds`() {
        val signingKey = generateEd25519KeyPair()
        val ed25519PublicKeyBytes = signingKey.generatePublicKey().encoded
        val encryptionKey = randomEncryptionKey()

        val signature = Signature.signEncryptionKey(encryptionKey, signingKey)

        assertTrue(Signature.verifyEncryptionKeyBytes(encryptionKey, ed25519PublicKeyBytes, signature))
    }

    @Test
    fun `verifyEncryptionKeyBytes fails with wrong public key bytes`() {
        val signingKey = generateEd25519KeyPair()
        val wrongKey = generateEd25519KeyPair()
        val wrongPublicKeyBytes = wrongKey.generatePublicKey().encoded
        val encryptionKey = randomEncryptionKey()

        val signature = Signature.signEncryptionKey(encryptionKey, signingKey)

        assertFalse(Signature.verifyEncryptionKeyBytes(encryptionKey, wrongPublicKeyBytes, signature))
    }

    @Test
    fun `verifyEncryptionKeyBytes rejects wrong ed25519 key size`() {
        val encryptionKey = randomEncryptionKey()
        val validSignature = ByteArray(Signature.SIGNATURE_SIZE)

        assertThrows<IllegalArgumentException> {
            Signature.verifyEncryptionKeyBytes(encryptionKey, ByteArray(16), validSignature)
        }

        assertThrows<IllegalArgumentException> {
            Signature.verifyEncryptionKeyBytes(encryptionKey, ByteArray(0), validSignature)
        }

        assertThrows<IllegalArgumentException> {
            Signature.verifyEncryptionKeyBytes(encryptionKey, ByteArray(64), validSignature)
        }
    }

    @Test
    fun `verifyEncryptionKeyBytes matches verifyEncryptionKey`() {
        val signingKey = generateEd25519KeyPair()
        val verifyingKey = signingKey.generatePublicKey()
        val ed25519PublicKeyBytes = verifyingKey.encoded
        val encryptionKey = randomEncryptionKey()

        val signature = Signature.signEncryptionKey(encryptionKey, signingKey)

        val resultFromParams = Signature.verifyEncryptionKey(encryptionKey, verifyingKey, signature)
        val resultFromBytes = Signature.verifyEncryptionKeyBytes(encryptionKey, ed25519PublicKeyBytes, signature)

        assertEquals(resultFromParams, resultFromBytes)
    }
}
