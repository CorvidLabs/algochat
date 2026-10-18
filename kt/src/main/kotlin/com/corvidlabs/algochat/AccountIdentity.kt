package com.corvidlabs.algochat

import org.bouncycastle.crypto.AsymmetricCipherKeyPair
import org.bouncycastle.crypto.digests.SHA256Digest
import org.bouncycastle.crypto.prng.EntropySource
import org.bouncycastle.crypto.prng.EntropySourceProvider
import org.bouncycastle.crypto.prng.SP800SecureRandomBuilder
import org.bouncycastle.math.ec.rfc8032.Ed25519
import org.bouncycastle.pqc.crypto.falcon.FalconKeyGenerationParameters
import org.bouncycastle.pqc.crypto.falcon.FalconKeyPairGenerator
import org.bouncycastle.pqc.crypto.falcon.FalconParameters
import org.bouncycastle.pqc.crypto.falcon.FalconPublicKeyParameters
import java.security.MessageDigest

/**
 * Payment-authorization scheme used to derive an account address from a seed.
 *
 * Ed25519 is the default. Falcon-1024 uses the same 32-byte mnemonic entropy
 * and a different address.
 */
enum class SigningScheme {
    ED25519,
    FALCON_1024
}

/**
 * Algorand addresses for the seed a 25-word mnemonic decodes to.
 *
 * The seed is that 32-byte entropy. Ed25519 uses it as the private key.
 * Falcon-1024 derives its key seed as SHA-512/256("PQK" || "f1" || entropy)
 * and its address as the checksummed SHA-512/256("PQA" || "f1" || salt || pk),
 * with the lowest salt whose digest is not an Ed25519 point.
 */
object AlgorandIdentity {
    private const val ADDRESS_LENGTH = 58

    /** Address for [seed] under [scheme]. */
    fun address(seed: ByteArray, scheme: SigningScheme = SigningScheme.ED25519): String {
        require(seed.size == 32) { "Seed must be 32 bytes" }
        return when (scheme) {
            SigningScheme.ED25519 -> encodeAddress(ed25519PublicKey(seed))
            SigningScheme.FALCON_1024 -> falconAddress(seed)
        }
    }

    /** 32-byte Ed25519 public key for a 32-byte account seed. */
    fun ed25519PublicKey(seed: ByteArray): ByteArray {
        require(seed.size == 32) { "Seed must be 32 bytes" }
        val privateKey = org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters(seed, 0)
        return privateKey.generatePublicKey().encoded
    }

    private fun falconAddress(entropy: ByteArray): String {
        val publicKey = falconPublicKey(entropy)
        val prefix = "PQA".toByteArray(Charsets.US_ASCII)
        val scheme = "f1".toByteArray(Charsets.US_ASCII)
        for (salt in 0..255) {
            val preimage = prefix + scheme + byteArrayOf(salt.toByte()) + publicKey
            val digest = sha512256(preimage)
            if (!couldBeEd25519Point(digest)) {
                return encodeAddress(digest)
            }
        }
        throw IllegalArgumentException("No Falcon address salt exists for this seed")
    }

    private fun falconPublicKey(entropy: ByteArray): ByteArray {
        val keySeed = sha512256("PQK".toByteArray(Charsets.US_ASCII) + "f1".toByteArray(Charsets.US_ASCII) + entropy)
        val random = SP800SecureRandomBuilder(seededEntropy(keySeed))
            .buildHash(SHA256Digest(), keySeed, false)
        val generator = FalconKeyPairGenerator()
        generator.init(FalconKeyGenerationParameters(random, FalconParameters.falcon_1024))
        val pair: AsymmetricCipherKeyPair = generator.generateKeyPair()
        return (pair.public as FalconPublicKeyParameters).getH().copyOf()
    }

    /** Entropy that repeats a hash of the seed. Key generation stays deterministic. */
    private fun seededEntropy(seed: ByteArray): EntropySourceProvider {
        return EntropySourceProvider { bitsRequired ->
            object : EntropySource {
                override fun isPredictionResistant(): Boolean = false
                override fun entropySize(): Int = bitsRequired
                override fun getEntropy(): ByteArray {
                    val bytes = (bitsRequired + 7) / 8
                    val out = ByteArray(bytes)
                    var produced = 0
                    var block = 0
                    while (produced < bytes) {
                        val digest = MessageDigest.getInstance("SHA-256")
                        digest.update(seed)
                        digest.update(block.toByte())
                        block += 1
                        val chunk = digest.digest()
                        val count = minOf(chunk.size, bytes - produced)
                        chunk.copyInto(out, produced, 0, count)
                        produced += count
                    }
                    return out
                }
            }
        }
    }

    private fun couldBeEd25519Point(point: ByteArray): Boolean {
        if (point.size != 32) return false
        return Ed25519.validatePublicKeyPartial(point, 0)
    }

    /** Checksummed base32 address for a 32-byte payload. */
    fun encodeAddress(payload: ByteArray): String {
        require(payload.size == 32) { "Address payload must be 32 bytes" }
        val hash = sha512256(payload)
        val checksum = hash.copyOfRange(hash.size - 4, hash.size)
        val encoded = base32Encode(payload + checksum)
        require(encoded.length == ADDRESS_LENGTH) { "Encoded address length ${encoded.length}" }
        return encoded
    }

    private fun sha512256(data: ByteArray): ByteArray {
        return MessageDigest.getInstance("SHA-512/256").digest(data)
    }

    private fun base32Encode(data: ByteArray): String {
        val alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
        val out = StringBuilder()
        var buffer = 0
        var bitsLeft = 0
        for (b in data) {
            buffer = (buffer shl 8) or (b.toInt() and 0xFF)
            bitsLeft += 8
            while (bitsLeft >= 5) {
                bitsLeft -= 5
                out.append(alphabet[(buffer shr bitsLeft) and 0x1F])
            }
        }
        if (bitsLeft > 0) {
            out.append(alphabet[(buffer shl (5 - bitsLeft)) and 0x1F])
        }
        return out.toString()
    }
}
