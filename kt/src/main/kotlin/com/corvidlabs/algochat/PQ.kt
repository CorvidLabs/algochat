package com.corvidlabs.algochat

import org.bouncycastle.crypto.InvalidCipherTextException
import org.bouncycastle.crypto.digests.SHA256Digest
import org.bouncycastle.crypto.generators.HKDFBytesGenerator
import org.bouncycastle.crypto.modes.ChaCha20Poly1305
import org.bouncycastle.crypto.params.AEADParameters
import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters
import org.bouncycastle.crypto.params.Ed25519PublicKeyParameters
import org.bouncycastle.crypto.params.HKDFParameters
import org.bouncycastle.crypto.params.KeyParameter
import org.bouncycastle.crypto.params.X25519PrivateKeyParameters
import org.bouncycastle.crypto.signers.Ed25519Signer
import org.bouncycastle.pqc.crypto.mlkem.MLKEMExtractor
import org.bouncycastle.pqc.crypto.mlkem.MLKEMGenerator
import org.bouncycastle.pqc.crypto.mlkem.MLKEMParameters
import org.bouncycastle.pqc.crypto.mlkem.MLKEMPrivateKeyParameters
import org.bouncycastle.pqc.crypto.mlkem.MLKEMPublicKeyParameters
import java.security.MessageDigest
import java.security.SecureRandom

/**
 * Hybrid X25519 + ML-KEM-768 session.
 *
 * The handshake is one note. The steady-state message is a separate note under
 * the hybrid session key. The long-term ML-KEM key opens every handshake sent
 * to that account, so this is not forward secrecy.
 */
object PQProtocol {
    /** Header version byte for hybrid sessions. Not the v1 envelope version. */
    const val VERSION: Byte = 0x02

    /** One-note session handshake. */
    const val HANDSHAKE_ID: Byte = 0x04

    /** Steady-state message encrypted under the handshake session key. */
    const val DATA_ID: Byte = 0x05

    const val MLKEM_EK_SIZE = 1184
    const val MLKEM_CT_SIZE = 1088
    const val EK_HASH_SIZE = 32
    const val ENCRYPTED_SESSION_KEY_SIZE = 48

    /**
     * version, protocol, sender, recipient, ephemeral, ciphertext, ek hash,
     * nonce, wrapped session key.
     */
    const val HANDSHAKE_SIZE =
        2 + 32 + 32 + 32 + MLKEM_CT_SIZE + EK_HASH_SIZE + Protocol.NONCE_SIZE + ENCRYPTED_SESSION_KEY_SIZE

    /** version + protocol + sender + handshake id + nonce */
    const val DATA_HEADER_SIZE = 2 + 32 + 32 + Protocol.NONCE_SIZE

    /** 4096-byte note, minus the 78-byte header and 16-byte Poly1305 tag. */
    const val MAX_PAYLOAD_SIZE = Protocol.MAX_NOTE_SIZE - DATA_HEADER_SIZE - Protocol.TAG_SIZE

    /** ASCII "ACPQ". Keeps a PQ announcement out of the 32-byte X25519 parser. */
    val ANNOUNCE_MAGIC = "ACPQ".toByteArray(Charsets.US_ASCII)

    const val ANNOUNCE_VERSION: Byte = 0x01

    const val ANNOUNCE_UNSIGNED_SIZE = 4 + 1 + MLKEM_EK_SIZE
    const val ANNOUNCE_SIGNED_SIZE = ANNOUNCE_UNSIGNED_SIZE + Protocol.SIGNATURE_SIZE
}

/**
 * ML-KEM-768 key pair derived from the account seed.
 *
 * [decapsulationKey] was expanded from the FIPS 203 seed `d || z`.
 */
class MLKEMKeyPair(
    val encapsKey: ByteArray,
    val decapsulationKey: MLKEMPrivateKeyParameters
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is MLKEMKeyPair) return false
        val seed = decapsulationKey.seed
        val otherSeed = other.decapsulationKey.seed
        return encapsKey.contentEquals(other.encapsKey) &&
            seed != null &&
            otherSeed != null &&
            seed.contentEquals(otherSeed)
    }

    override fun hashCode(): Int {
        var result = encapsKey.contentHashCode()
        val seed = decapsulationKey.seed
        if (seed != null) {
            result = 31 * result + seed.contentHashCode()
        }
        return result
    }
}

/** ML-KEM encapsulation result. */
class MLKEMEncapsulation(
    val ciphertext: ByteArray,
    val sharedSecret: ByteArray
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is MLKEMEncapsulation) return false
        return ciphertext.contentEquals(other.ciphertext) && sharedSecret.contentEquals(other.sharedSecret)
    }

    override fun hashCode(): Int {
        var result = ciphertext.contentHashCode()
        result = 31 * result + sharedSecret.contentHashCode()
        return result
    }
}

/** Hybrid session key shared by a handshake note. */
class PQSession(
    val sessionKey: ByteArray,
    val senderPublicKey: ByteArray,
    val recipientPublicKey: ByteArray,
    /** SHA-256 of the handshake note. */
    val handshakeId: ByteArray
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is PQSession) return false
        return sessionKey.contentEquals(other.sessionKey) &&
            senderPublicKey.contentEquals(other.senderPublicKey) &&
            recipientPublicKey.contentEquals(other.recipientPublicKey) &&
            handshakeId.contentEquals(other.handshakeId)
    }

    override fun hashCode(): Int {
        var result = sessionKey.contentHashCode()
        result = 31 * result + senderPublicKey.contentHashCode()
        result = 31 * result + recipientPublicKey.contentHashCode()
        result = 31 * result + handshakeId.contentHashCode()
        return result
    }
}

/** One-note ML-KEM encapsulation-key announcement. */
class PQAnnouncement(
    val encapsKey: ByteArray,
    val isVerified: Boolean
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is PQAnnouncement) return false
        return isVerified == other.isVerified && encapsKey.contentEquals(other.encapsKey)
    }

    override fun hashCode(): Int {
        var result = encapsKey.contentHashCode()
        result = 31 * result + isVerified.hashCode()
        return result
    }
}

/** Handshake note plus the sender's session. */
class PQHandshake(
    val note: ByteArray,
    val session: PQSession
)

/**
 * Hybrid session operations.
 *
 * ML-KEM-768 key generation passes HKDF outputs `d` and `z` through as the
 * FIPS 203 64-byte seed. That concatenation is not hashed again.
 */
object PQ {
    private val secureRandom = SecureRandom()

    private val MLKEM_SALT = "AlgoChat-v1-mlkem768".toByteArray(Charsets.UTF_8)
    private val MLKEM_INFO_D = "mlkem768-d".toByteArray(Charsets.UTF_8)
    private val MLKEM_INFO_Z = "mlkem768-z".toByteArray(Charsets.UTF_8)
    private val HYBRID_LABEL = "algochat-pq-v1".toByteArray(Charsets.UTF_8)
    private val SENDER_WRAP_INFO = "AlgoChatPQ-SenderKey".toByteArray(Charsets.UTF_8)
    private val ANNOUNCE_SIGN_LABEL = "AlgoChat-pq-ek-v1".toByteArray(Charsets.UTF_8)

    /**
     * Derive an ML-KEM-768 key pair from the 32-byte account seed.
     *
     * Salt is `AlgoChat-v1-mlkem768`. Info is `mlkem768-d` and `mlkem768-z`.
     * The key-generation seed is the concatenation of those two outputs.
     */
    fun deriveMLKEMKeyPair(seed: ByteArray): MLKEMKeyPair {
        if (seed.size != 32) {
            throw AlgoChatException.KeyDerivationFailed("Seed must be 32 bytes, got ${seed.size}")
        }
        val d = hkdf(seed, MLKEM_SALT, MLKEM_INFO_D)
        val z = hkdf(seed, MLKEM_SALT, MLKEM_INFO_Z)
        // FIPS 203 KeyGen seed is d || z. Do not hash this 64-byte value.
        val decapsulationKey = MLKEMPrivateKeyParameters(MLKEMParameters.ml_kem_768, d + z)
        val encapsKey = decapsulationKey.publicKeyParameters.encoded.copyOf()
        if (encapsKey.size != PQProtocol.MLKEM_EK_SIZE) {
            throw AlgoChatException.KeyDerivationFailed(
                "Encapsulation key must be ${PQProtocol.MLKEM_EK_SIZE} bytes, got ${encapsKey.size}"
            )
        }
        return MLKEMKeyPair(encapsKey, decapsulationKey)
    }

    /**
     * Encapsulate to [recipientEncapsKey].
     *
     * [randomness] is the 32-byte ML-KEM coins. Omit it for a random encapsulation.
     */
    fun encapsulate(recipientEncapsKey: ByteArray, randomness: ByteArray? = null): MLKEMEncapsulation {
        requireSize("encapsulation key", recipientEncapsKey, PQProtocol.MLKEM_EK_SIZE)
        val coins = randomness ?: randomBytes(32)
        requireSize("ML-KEM randomness", coins, 32)
        val publicKey = MLKEMPublicKeyParameters(MLKEMParameters.ml_kem_768, recipientEncapsKey)
        val encapsulated = MLKEMGenerator(secureRandom).internalGenerateEncapsulated(publicKey, coins)
        val ciphertext = encapsulated.encapsulation.copyOf()
        val sharedSecret = encapsulated.secret.copyOf()
        requireSize("ML-KEM ciphertext", ciphertext, PQProtocol.MLKEM_CT_SIZE)
        requireSize("ML-KEM shared secret", sharedSecret, 32)
        return MLKEMEncapsulation(ciphertext, sharedSecret)
    }

    /** Decapsulate [ciphertext] with the recipient's ML-KEM key. */
    fun decapsulate(ciphertext: ByteArray, keyPair: MLKEMKeyPair): ByteArray {
        requireSize("ML-KEM ciphertext", ciphertext, PQProtocol.MLKEM_CT_SIZE)
        val secret = MLKEMExtractor(keyPair.decapsulationKey).extractSecret(ciphertext).copyOf()
        requireSize("ML-KEM shared secret", secret, 32)
        return secret
    }

    /**
     * Hybrid session key.
     *
     * HKDF-SHA256 salt and the info label are `algochat-pq-v1`.
     * IKM is the X25519 secret followed by the ML-KEM secret.
     * Info then appends the ephemeral public key, ML-KEM ciphertext, both
     * X25519 public keys, and SHA-256 of the encapsulation key.
     */
    fun deriveHybridPQKey(
        ecSharedSecret: ByteArray,
        pqSharedSecret: ByteArray,
        ephemeralPublicKey: ByteArray,
        kemCiphertext: ByteArray,
        senderPublicKey: ByteArray,
        recipientPublicKey: ByteArray,
        recipientEncapsKey: ByteArray
    ): ByteArray {
        requireSize("X25519 shared secret", ecSharedSecret, 32)
        requireSize("ML-KEM shared secret", pqSharedSecret, 32)
        requireSize("ephemeral public key", ephemeralPublicKey, 32)
        requireSize("ML-KEM ciphertext", kemCiphertext, PQProtocol.MLKEM_CT_SIZE)
        requireSize("sender public key", senderPublicKey, 32)
        requireSize("recipient public key", recipientPublicKey, 32)
        requireSize("encapsulation key", recipientEncapsKey, PQProtocol.MLKEM_EK_SIZE)
        val ikm = ecSharedSecret + pqSharedSecret
        val info = HYBRID_LABEL +
            ephemeralPublicKey +
            kemCiphertext +
            senderPublicKey +
            recipientPublicKey +
            sha256(recipientEncapsKey)
        return hkdf(ikm, HYBRID_LABEL, info)
    }

    /** Build a handshake note and the sender's session. */
    fun initiatePQSession(
        sender: KeyPair,
        recipientPublicKey: ByteArray,
        recipientEncapsKey: ByteArray,
        kemRandomness: ByteArray? = null
    ): PQHandshake {
        requireSize("recipient public key", recipientPublicKey, 32)
        requireSize("encapsulation key", recipientEncapsKey, PQProtocol.MLKEM_EK_SIZE)

        val senderPublicKey = Keys.publicKeyToBytes(sender.publicKey)
        val ephemeral = Keys.generateEphemeralKeyPair()
        val ephemeralPublicKey = Keys.publicKeyToBytes(ephemeral.publicKey)
        val ecShared = Keys.x25519Ecdh(ephemeral.privateKey, Keys.publicKeyFromBytes(recipientPublicKey))
        val encapsulated = encapsulate(recipientEncapsKey, kemRandomness)
        val sessionKey = deriveHybridPQKey(
            ecShared,
            encapsulated.sharedSecret,
            ephemeralPublicKey,
            encapsulated.ciphertext,
            senderPublicKey,
            recipientPublicKey,
            recipientEncapsKey
        )
        val nonce = randomBytes(Protocol.NONCE_SIZE)
        val prefix = handshakePrefix(
            senderPublicKey,
            recipientPublicKey,
            ephemeralPublicKey,
            encapsulated.ciphertext,
            recipientEncapsKey,
            nonce
        )
        val wrapKey = senderWrapKey(
            ephemeral.privateKey,
            senderPublicKey,
            senderPublicKey,
            ephemeralPublicKey
        )
        val wrapped = aeadEncrypt(wrapKey, nonce, sessionKey, prefix)
        if (wrapped.size != PQProtocol.ENCRYPTED_SESSION_KEY_SIZE) {
            throw AlgoChatException.EncryptionFailed("Wrapped session key is the wrong length")
        }
        val note = prefix + wrapped
        if (note.size != PQProtocol.HANDSHAKE_SIZE || note.size > Protocol.MAX_NOTE_SIZE) {
            throw AlgoChatException.EncryptionFailed("Handshake note is ${note.size} bytes")
        }
        return PQHandshake(note, sessionFrom(note, sessionKey, senderPublicKey, recipientPublicKey))
    }

    /** Open a handshake with the recipient's long-term X25519 and ML-KEM keys. */
    fun acceptPQSession(note: ByteArray, recipient: KeyPair, kem: MLKEMKeyPair): PQSession {
        val fields = parseHandshake(note)
        val recipientPublicKey = Keys.publicKeyToBytes(recipient.publicKey)
        if (!fields.recipientPublicKey.contentEquals(recipientPublicKey)) {
            throw AlgoChatException.DecryptionFailed("Handshake is for a different X25519 key")
        }
        if (!fields.encapsKeyHash.contentEquals(sha256(kem.encapsKey))) {
            throw AlgoChatException.DecryptionFailed("Handshake encapsulation key does not match")
        }
        val ecShared = Keys.x25519Ecdh(
            recipient.privateKey,
            Keys.publicKeyFromBytes(fields.ephemeralPublicKey)
        )
        val pqShared = decapsulate(fields.kemCiphertext, kem)
        val sessionKey = deriveHybridPQKey(
            ecShared,
            pqShared,
            fields.ephemeralPublicKey,
            fields.kemCiphertext,
            fields.senderPublicKey,
            fields.recipientPublicKey,
            kem.encapsKey
        )
        return sessionFrom(note, sessionKey, fields.senderPublicKey, fields.recipientPublicKey)
    }

    /** Sender recovers the session from the handshake note and the long-term X25519 key. */
    fun openPQSessionAsSender(note: ByteArray, sender: KeyPair): PQSession {
        val fields = parseHandshake(note)
        val senderPublicKey = Keys.publicKeyToBytes(sender.publicKey)
        if (!fields.senderPublicKey.contentEquals(senderPublicKey)) {
            throw AlgoChatException.DecryptionFailed("Handshake was not sent by this key")
        }
        val wrapKey = senderWrapKey(
            sender.privateKey,
            fields.ephemeralPublicKey,
            senderPublicKey,
            fields.ephemeralPublicKey
        )
        val prefix = note.copyOfRange(0, note.size - PQProtocol.ENCRYPTED_SESSION_KEY_SIZE)
        val sessionKey = try {
            aeadDecrypt(wrapKey, fields.nonce, fields.wrappedSessionKey, prefix)
        } catch (e: InvalidCipherTextException) {
            throw AlgoChatException.DecryptionFailed("Handshake sender wrap failed")
        }
        if (sessionKey.size != 32) {
            throw AlgoChatException.DecryptionFailed("Handshake sender wrap failed")
        }
        return sessionFrom(note, sessionKey, fields.senderPublicKey, fields.recipientPublicKey)
    }

    /** Seal [plaintext] under the session key. The 78-byte header is AEAD associated data. */
    fun encryptPQMessage(plaintext: String, session: PQSession): ByteArray {
        val message = plaintext.toByteArray(Charsets.UTF_8)
        if (message.size > PQProtocol.MAX_PAYLOAD_SIZE) {
            throw AlgoChatException.EncryptionFailed(
                "Message too large: ${message.size} bytes (max ${PQProtocol.MAX_PAYLOAD_SIZE})"
            )
        }
        val nonce = randomBytes(Protocol.NONCE_SIZE)
        val header = dataHeader(session.senderPublicKey, session.handshakeId, nonce)
        val ciphertext = aeadEncrypt(session.sessionKey, nonce, message, header)
        val note = header + ciphertext
        if (note.size > Protocol.MAX_NOTE_SIZE) {
            throw AlgoChatException.EncryptionFailed("PQ message note is ${note.size} bytes")
        }
        return note
    }

    /** Open a steady-state message. A failed tag does not return plaintext. */
    fun decryptPQMessage(note: ByteArray, session: PQSession): String {
        if (!isPQMessage(note)) {
            throw AlgoChatException.InvalidEnvelope("Not a PQ message")
        }
        val senderPublicKey = note.copyOfRange(2, 34)
        val handshakeId = note.copyOfRange(34, 66)
        val nonce = note.copyOfRange(66, 78)
        val ciphertext = note.copyOfRange(78, note.size)
        if (!handshakeId.contentEquals(session.handshakeId)) {
            throw AlgoChatException.DecryptionFailed("Message is for a different handshake")
        }
        if (!senderPublicKey.contentEquals(session.senderPublicKey)) {
            throw AlgoChatException.DecryptionFailed("Message sender does not match the handshake")
        }
        val header = note.copyOfRange(0, PQProtocol.DATA_HEADER_SIZE)
        val plaintext = try {
            aeadDecrypt(session.sessionKey, nonce, ciphertext, header)
        } catch (e: InvalidCipherTextException) {
            throw AlgoChatException.DecryptionFailed("PQ message authentication failed")
        }
        return plaintext.toString(Charsets.UTF_8)
    }

    fun isPQHandshake(note: ByteArray): Boolean {
        return note.size == PQProtocol.HANDSHAKE_SIZE &&
            note[0] == PQProtocol.VERSION &&
            note[1] == PQProtocol.HANDSHAKE_ID
    }

    fun isPQMessage(note: ByteArray): Boolean {
        return note.size >= PQProtocol.DATA_HEADER_SIZE + Protocol.TAG_SIZE &&
            note[0] == PQProtocol.VERSION &&
            note[1] == PQProtocol.DATA_ID
    }

    /** SHA-256 of the announcement label, version byte, and encapsulation key. */
    fun pqAnnouncementSigningInput(encapsKey: ByteArray): ByteArray {
        requireSize("encapsulation key", encapsKey, PQProtocol.MLKEM_EK_SIZE)
        return sha256(ANNOUNCE_SIGN_LABEL + byteArrayOf(PQProtocol.ANNOUNCE_VERSION) + encapsKey)
    }

    /**
     * Encode an encapsulation-key announcement.
     *
     * No [signingKey] means the announcement is unverified. A signature is over
     * [pqAnnouncementSigningInput].
     */
    fun encodePQKeyAnnouncement(
        encapsKey: ByteArray,
        signingKey: Ed25519PrivateKeyParameters? = null
    ): ByteArray {
        requireSize("encapsulation key", encapsKey, PQProtocol.MLKEM_EK_SIZE)
        val body = PQProtocol.ANNOUNCE_MAGIC + byteArrayOf(PQProtocol.ANNOUNCE_VERSION) + encapsKey
        if (signingKey == null) {
            return body
        }
        val signer = Ed25519Signer()
        signer.init(true, signingKey)
        val message = pqAnnouncementSigningInput(encapsKey)
        signer.update(message, 0, message.size)
        return body + signer.generateSignature()
    }

    /**
     * Parse an encapsulation-key announcement.
     *
     * A bad signature is rejected. No signature is unverified.
     * Returns null when the note is not an announcement.
     */
    fun parsePQKeyAnnouncement(note: ByteArray, ed25519PublicKey: ByteArray? = null): PQAnnouncement? {
        if (!isPQKeyAnnouncement(note)) return null
        if (note.size != PQProtocol.ANNOUNCE_UNSIGNED_SIZE && note.size != PQProtocol.ANNOUNCE_SIGNED_SIZE) {
            return null
        }
        if (note[PQProtocol.ANNOUNCE_MAGIC.size] != PQProtocol.ANNOUNCE_VERSION) return null
        val encapsKey = note.copyOfRange(PQProtocol.ANNOUNCE_MAGIC.size + 1, PQProtocol.ANNOUNCE_UNSIGNED_SIZE)
        if (note.size == PQProtocol.ANNOUNCE_UNSIGNED_SIZE) {
            return PQAnnouncement(encapsKey, isVerified = false)
        }
        if (ed25519PublicKey == null || ed25519PublicKey.size != 32) return null
        val signature = note.copyOfRange(PQProtocol.ANNOUNCE_UNSIGNED_SIZE, note.size)
        val verified = try {
            val verifier = Ed25519Signer()
            verifier.init(false, Ed25519PublicKeyParameters(ed25519PublicKey, 0))
            val message = pqAnnouncementSigningInput(encapsKey)
            verifier.update(message, 0, message.size)
            verifier.verifySignature(signature)
        } catch (e: Exception) {
            false
        }
        if (!verified) return null
        return PQAnnouncement(encapsKey, isVerified = true)
    }

    fun isPQKeyAnnouncement(note: ByteArray): Boolean {
        if (note.size < PQProtocol.ANNOUNCE_MAGIC.size) return false
        return note.copyOfRange(0, PQProtocol.ANNOUNCE_MAGIC.size).contentEquals(PQProtocol.ANNOUNCE_MAGIC)
    }

    private fun randomBytes(size: Int): ByteArray {
        val bytes = ByteArray(size)
        secureRandom.nextBytes(bytes)
        return bytes
    }

    private fun hkdf(ikm: ByteArray, salt: ByteArray, info: ByteArray): ByteArray {
        val hkdf = HKDFBytesGenerator(SHA256Digest())
        hkdf.init(HKDFParameters(ikm, salt, info))
        val key = ByteArray(32)
        hkdf.generateBytes(key, 0, 32)
        return key
    }

    private fun sha256(data: ByteArray): ByteArray {
        return MessageDigest.getInstance("SHA-256").digest(data)
    }

    private fun requireSize(name: String, value: ByteArray, size: Int) {
        if (value.size != size) {
            throw AlgoChatException.InvalidEnvelope("$name must be $size bytes, got ${value.size}")
        }
    }

    private fun aeadEncrypt(key: ByteArray, nonce: ByteArray, plaintext: ByteArray, aad: ByteArray): ByteArray {
        val cipher = ChaCha20Poly1305()
        cipher.init(true, AEADParameters(KeyParameter(key), 128, nonce, aad))
        val output = ByteArray(cipher.getOutputSize(plaintext.size))
        val len = cipher.processBytes(plaintext, 0, plaintext.size, output, 0)
        cipher.doFinal(output, len)
        return output
    }

    private fun aeadDecrypt(key: ByteArray, nonce: ByteArray, ciphertext: ByteArray, aad: ByteArray): ByteArray {
        val cipher = ChaCha20Poly1305()
        cipher.init(false, AEADParameters(KeyParameter(key), 128, nonce, aad))
        val output = ByteArray(cipher.getOutputSize(ciphertext.size))
        var len = cipher.processBytes(ciphertext, 0, ciphertext.size, output, 0)
        len += cipher.doFinal(output, len)
        return output.copyOf(len)
    }

    private fun handshakePrefix(
        senderPublicKey: ByteArray,
        recipientPublicKey: ByteArray,
        ephemeralPublicKey: ByteArray,
        kemCiphertext: ByteArray,
        encapsKey: ByteArray,
        nonce: ByteArray
    ): ByteArray {
        val prefix = ByteArray(PQProtocol.HANDSHAKE_SIZE - PQProtocol.ENCRYPTED_SESSION_KEY_SIZE)
        var offset = 0
        prefix[offset++] = PQProtocol.VERSION
        prefix[offset++] = PQProtocol.HANDSHAKE_ID
        senderPublicKey.copyInto(prefix, offset)
        offset += 32
        recipientPublicKey.copyInto(prefix, offset)
        offset += 32
        ephemeralPublicKey.copyInto(prefix, offset)
        offset += 32
        kemCiphertext.copyInto(prefix, offset)
        offset += PQProtocol.MLKEM_CT_SIZE
        sha256(encapsKey).copyInto(prefix, offset)
        offset += 32
        nonce.copyInto(prefix, offset)
        return prefix
    }

    private class HandshakeFields(
        val senderPublicKey: ByteArray,
        val recipientPublicKey: ByteArray,
        val ephemeralPublicKey: ByteArray,
        val kemCiphertext: ByteArray,
        val encapsKeyHash: ByteArray,
        val nonce: ByteArray,
        val wrappedSessionKey: ByteArray
    )

    private fun parseHandshake(note: ByteArray): HandshakeFields {
        if (!isPQHandshake(note)) {
            throw AlgoChatException.InvalidEnvelope("PQ handshake must be ${PQProtocol.HANDSHAKE_SIZE} bytes")
        }
        var offset = 2
        val senderPublicKey = note.copyOfRange(offset, offset + 32)
        offset += 32
        val recipientPublicKey = note.copyOfRange(offset, offset + 32)
        offset += 32
        val ephemeralPublicKey = note.copyOfRange(offset, offset + 32)
        offset += 32
        val kemCiphertext = note.copyOfRange(offset, offset + PQProtocol.MLKEM_CT_SIZE)
        offset += PQProtocol.MLKEM_CT_SIZE
        val encapsKeyHash = note.copyOfRange(offset, offset + 32)
        offset += 32
        val nonce = note.copyOfRange(offset, offset + Protocol.NONCE_SIZE)
        offset += Protocol.NONCE_SIZE
        val wrappedSessionKey = note.copyOfRange(offset, offset + PQProtocol.ENCRYPTED_SESSION_KEY_SIZE)
        return HandshakeFields(
            senderPublicKey,
            recipientPublicKey,
            ephemeralPublicKey,
            kemCiphertext,
            encapsKeyHash,
            nonce,
            wrappedSessionKey
        )
    }

    private fun dataHeader(senderPublicKey: ByteArray, handshakeId: ByteArray, nonce: ByteArray): ByteArray {
        val header = ByteArray(PQProtocol.DATA_HEADER_SIZE)
        header[0] = PQProtocol.VERSION
        header[1] = PQProtocol.DATA_ID
        senderPublicKey.copyInto(header, 2)
        handshakeId.copyInto(header, 34)
        nonce.copyInto(header, 66)
        return header
    }

    private fun sessionFrom(
        note: ByteArray,
        sessionKey: ByteArray,
        senderPublicKey: ByteArray,
        recipientPublicKey: ByteArray
    ): PQSession {
        return PQSession(
            sessionKey.copyOf(),
            senderPublicKey.copyOf(),
            recipientPublicKey.copyOf(),
            sha256(note)
        )
    }

    private fun senderWrapKey(
        privateKey: X25519PrivateKeyParameters,
        otherPublicKey: ByteArray,
        senderPublicKey: ByteArray,
        ephemeralPublicKey: ByteArray
    ): ByteArray {
        val agreed = Keys.x25519Ecdh(privateKey, Keys.publicKeyFromBytes(otherPublicKey))
        return hkdf(agreed, ephemeralPublicKey, SENDER_WRAP_INFO + senderPublicKey)
    }
}
