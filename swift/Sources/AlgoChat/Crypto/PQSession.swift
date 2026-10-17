@preconcurrency import Crypto
import Foundation

#if canImport(Security)
import Security
#endif

/// Wire constants for the hybrid X25519 + ML-KEM-768 session.
///
/// Protocol `0x03` is not assigned. Everyday notes stay `0x01` and Extra lock stays `0x02`.
public enum PQProtocol {
    /// Header-authenticated version byte. Not the `0x01` envelope version.
    public static let version: UInt8 = 0x02

    /// One-note session handshake.
    public static let handshakeID: UInt8 = 0x04

    /// Message sealed under the handshake session key.
    public static let messageID: UInt8 = 0x05

    public static let encapsKeySize = 1184
    public static let ciphertextSize = 1088
    public static let sharedSecretSize = 32
    public static let nonceSize = 12
    public static let wrappedKeySize = 48
    public static let tagSize = 16

    /// version, protocol, sender, recipient, ephemeral, ciphertext, ek hash, nonce, wrapped key
    public static let handshakeSize =
        2 + 32 + 32 + 32 + ciphertextSize + 32 + nonceSize + wrappedKeySize

    /// version, protocol, sender, handshake id, nonce
    public static let messageHeaderSize = 2 + 32 + 32 + nonceSize

    public static let maxPayloadSize = ChatEnvelope.maxNoteSize - messageHeaderSize - tagSize
}

/// Parsed `ACPQ` encapsulation-key announcement.
public struct PQAnnouncement: Sendable, Equatable {
    public let encapsKey: Data
    public let isVerified: Bool

    public static let magic = Data([0x41, 0x43, 0x50, 0x51])
    public static let version: UInt8 = 0x01

    private static let signLabel = Data("AlgoChat-pq-ek-v1".utf8)
    private static let unsignedSize = 4 + 1 + PQProtocol.encapsKeySize
    private static let signedSize = unsignedSize + 64

    /// True when the note starts with `ACPQ`. Those notes are not X25519 keys.
    public static func isAnnouncement(_ note: Data) -> Bool {
        note.count >= magic.count && note.prefix(magic.count) == magic
    }

    /// Encodes `ACPQ | version | encapsulation key` and an optional Ed25519 signature.
    public static func encode(
        encapsKey: Data,
        signingKey: Curve25519.Signing.PrivateKey? = nil
    ) throws -> Data {
        try requireCount("encapsulation key", encapsKey, PQProtocol.encapsKeySize)
        var note = Data(magic)
        note.append(version)
        note.append(encapsKey)
        if let signingKey {
            let signature = try signingKey.signature(for: signingInput(encapsKey))
            guard signature.count == 64 else {
                throw ChatError.invalidSignature("Ed25519 signature must be 64 bytes, got \(signature.count)")
            }
            note.append(signature)
        }
        return note
    }

    /**
     Parses an announcement.

     A bad signature is rejected. No signature is unverified. A signature without
     a verifying key is rejected rather than trusted.
     */
    public static func parse(_ note: Data, ed25519PublicKey: Data? = nil) -> PQAnnouncement? {
        guard isAnnouncement(note) else { return nil }
        guard note.count == unsignedSize || note.count == signedSize else { return nil }
        let bytes = [UInt8](note)
        guard bytes[magic.count] == version else { return nil }
        let encapsKey = Data(bytes[(magic.count + 1)..<unsignedSize])
        if note.count == unsignedSize {
            return PQAnnouncement(encapsKey: encapsKey, isVerified: false)
        }
        guard let ed25519PublicKey, ed25519PublicKey.count == 32 else { return nil }
        guard let verifyingKey = try? Curve25519.Signing.PublicKey(rawRepresentation: ed25519PublicKey) else {
            return nil
        }
        let signature = Data(bytes[unsignedSize..<signedSize])
        guard verifyingKey.isValidSignature(signature, for: signingInput(encapsKey)) else {
            return nil
        }
        return PQAnnouncement(encapsKey: encapsKey, isVerified: true)
    }

    private static func signingInput(_ encapsKey: Data) -> Data {
        var body = Data(signLabel)
        body.append(version)
        body.append(encapsKey)
        return Data(SHA256.hash(data: body))
    }
}

/**
 Hybrid session established by one `0x04` note.

 The session key needs both the X25519 secret and the ML-KEM secret. The
 long-term ML-KEM key opens every handshake sent to that account.
 */
public struct PQSession: Sendable {
    public let sessionKey: Data
    public let senderPublicKey: Data
    public let recipientPublicKey: Data

    /// SHA-256 of the handshake note.
    public let handshakeID: Data

    public static func isHandshake(_ note: Data) -> Bool {
        let bytes = [UInt8](note)
        return bytes.count == PQProtocol.handshakeSize
            && bytes.first == PQProtocol.version
            && bytes.dropFirst().first == PQProtocol.handshakeID
    }

    public static func isMessage(_ note: Data) -> Bool {
        let bytes = [UInt8](note)
        return bytes.count >= PQProtocol.messageHeaderSize + PQProtocol.tagSize
            && bytes.first == PQProtocol.version
            && bytes.dropFirst().first == PQProtocol.messageID
    }

    /// ML-KEM-768 private key from the 32-byte account seed. Seed is `d || z`.
    @available(macOS 26, iOS 26, watchOS 26, tvOS 26, visionOS 26, macCatalyst 26, *)
    public static func encapsulationPrivateKey(fromAccountSeed seed: Data) throws -> MLKEM768.PrivateKey {
        try MLKEM.privateKey(fromAccountSeed: seed)
    }

    /// HKDF-SHA256 session key. `ikm` is the X25519 secret followed by the ML-KEM secret.
    public static func deriveHybridKey(
        x25519SharedSecret: Data,
        mlkemSharedSecret: Data,
        ephemeralPublicKey: Data,
        kemCiphertext: Data,
        senderPublicKey: Data,
        recipientPublicKey: Data,
        encapsKey: Data
    ) throws -> Data {
        try requireCount("X25519 shared secret", x25519SharedSecret, 32)
        try requireCount("ML-KEM shared secret", mlkemSharedSecret, 32)
        try requireCount("ephemeral public key", ephemeralPublicKey, 32)
        try requireCount("ML-KEM ciphertext", kemCiphertext, PQProtocol.ciphertextSize)
        try requireCount("sender public key", senderPublicKey, 32)
        try requireCount("recipient public key", recipientPublicKey, 32)
        try requireCount("encapsulation key", encapsKey, PQProtocol.encapsKeySize)

        var ikm = Data()
        ikm.append(x25519SharedSecret)
        ikm.append(mlkemSharedSecret)

        var info = Data("algochat-pq-v1".utf8)
        info.append(ephemeralPublicKey)
        info.append(kemCiphertext)
        info.append(senderPublicKey)
        info.append(recipientPublicKey)
        info.append(Data(SHA256.hash(data: encapsKey)))

        return hkdf(ikm: ikm, salt: Data("algochat-pq-v1".utf8), info: info)
    }

    /// Builds a `0x04` handshake. Encapsulation coins are random; CryptoKit has no public coins argument.
    @available(macOS 26, iOS 26, watchOS 26, tvOS 26, visionOS 26, macCatalyst 26, *)
    public static func initiate(
        senderPrivateKey: Curve25519.KeyAgreement.PrivateKey,
        recipientPublicKey: Curve25519.KeyAgreement.PublicKey,
        recipientEncapsKey: Data
    ) throws -> (note: Data, session: PQSession) {
        try requireCount("encapsulation key", recipientEncapsKey, PQProtocol.encapsKeySize)
        let senderPublicKey = senderPrivateKey.publicKey.rawRepresentation
        let recipientPublic = recipientPublicKey.rawRepresentation

        let ephemeral = Curve25519.KeyAgreement.PrivateKey()
        let ecShared = try x25519SharedSecret(ephemeral, recipientPublic)
        let encapsulated = try MLKEM.encapsulate(recipientEncapsKey)
        let sessionKey = try deriveHybridKey(
            x25519SharedSecret: ecShared,
            mlkemSharedSecret: encapsulated.sharedSecret,
            ephemeralPublicKey: ephemeral.publicKey.rawRepresentation,
            kemCiphertext: encapsulated.ciphertext,
            senderPublicKey: senderPublicKey,
            recipientPublicKey: recipientPublic,
            encapsKey: recipientEncapsKey
        )

        let nonce = try randomBytes(count: PQProtocol.nonceSize)
        let prefix = handshakePrefix(
            senderPublicKey: senderPublicKey,
            recipientPublicKey: recipientPublic,
            ephemeralPublicKey: ephemeral.publicKey.rawRepresentation,
            kemCiphertext: encapsulated.ciphertext,
            encapsKey: recipientEncapsKey,
            nonce: nonce
        )
        let wrapKey = try senderWrapKey(
            privateKey: ephemeral,
            otherPublicKey: senderPublicKey,
            senderPublicKey: senderPublicKey,
            ephemeralPublicKey: ephemeral.publicKey.rawRepresentation
        )
        let wrapped = try seal(key: wrapKey, nonce: nonce, aad: prefix, plaintext: sessionKey)
        guard wrapped.count == PQProtocol.wrappedKeySize else {
            throw ChatError.invalidEnvelope("Wrapped session key is \(wrapped.count) bytes")
        }
        var note = Data(prefix)
        note.append(wrapped)
        guard note.count == PQProtocol.handshakeSize, note.count <= ChatEnvelope.maxNoteSize else {
            throw ChatError.invalidEnvelope("Handshake note is \(note.count) bytes")
        }
        return (note, sessionFrom(note, sessionKey, senderPublicKey, recipientPublic))
    }

    /// Opens a `0x04` note with the recipient's long-term X25519 and ML-KEM keys.
    @available(macOS 26, iOS 26, watchOS 26, tvOS 26, visionOS 26, macCatalyst 26, *)
    public static func accept(
        note: Data,
        recipientPrivateKey: Curve25519.KeyAgreement.PrivateKey,
        kemPrivateKey: MLKEM768.PrivateKey
    ) throws -> PQSession {
        let fields = try parseHandshake(note)
        guard fields.recipientPublicKey == recipientPrivateKey.publicKey.rawRepresentation else {
            throw ChatError.invalidEnvelope("Handshake is for a different X25519 key")
        }
        let encapsKey = Data([UInt8](kemPrivateKey.publicKey.rawRepresentation))
        guard fields.encapsKeyHash == Data(SHA256.hash(data: encapsKey)) else {
            throw ChatError.invalidEnvelope("Handshake encapsulation key does not match")
        }
        let ecShared = try x25519SharedSecret(recipientPrivateKey, fields.ephemeralPublicKey)
        let pqShared = try MLKEM.decapsulate(fields.kemCiphertext, privateKey: kemPrivateKey)
        let sessionKey = try deriveHybridKey(
            x25519SharedSecret: ecShared,
            mlkemSharedSecret: pqShared,
            ephemeralPublicKey: fields.ephemeralPublicKey,
            kemCiphertext: fields.kemCiphertext,
            senderPublicKey: fields.senderPublicKey,
            recipientPublicKey: fields.recipientPublicKey,
            encapsKey: encapsKey
        )
        return sessionFrom(note, sessionKey, fields.senderPublicKey, fields.recipientPublicKey)
    }

    /// Sender recovers the session from the note and the long-term X25519 key.
    public static func openAsSender(
        note: Data,
        senderPrivateKey: Curve25519.KeyAgreement.PrivateKey
    ) throws -> PQSession {
        let fields = try parseHandshake(note)
        guard fields.senderPublicKey == senderPrivateKey.publicKey.rawRepresentation else {
            throw ChatError.invalidEnvelope("Handshake was not sent by this key")
        }
        let wrapKey = try senderWrapKey(
            privateKey: senderPrivateKey,
            otherPublicKey: fields.ephemeralPublicKey,
            senderPublicKey: fields.senderPublicKey,
            ephemeralPublicKey: fields.ephemeralPublicKey
        )
        let prefix = Data([UInt8](note).prefix(note.count - PQProtocol.wrappedKeySize))
        let sessionKey: Data
        do {
            sessionKey = try open(key: wrapKey, nonce: fields.nonce, aad: prefix, ciphertextAndTag: fields.wrappedSessionKey)
        } catch {
            throw ChatError.decryptionFailed("Handshake sender wrap failed")
        }
        guard sessionKey.count == 32 else {
            throw ChatError.decryptionFailed("Session key must be 32 bytes, got \(sessionKey.count)")
        }
        return sessionFrom(note, sessionKey, fields.senderPublicKey, fields.recipientPublicKey)
    }

    /// Seals a UTF-8 message under the session key. The header is 78 bytes and is the AEAD associated data.
    public func encrypt(_ plaintext: String) throws -> Data {
        guard let message = plaintext.data(using: .utf8) else {
            throw ChatError.encodingFailed("Failed to encode message as UTF-8")
        }
        guard message.count <= PQProtocol.maxPayloadSize else {
            throw ChatError.messageTooLarge(maxSize: PQProtocol.maxPayloadSize)
        }
        let nonce = try randomBytes(count: PQProtocol.nonceSize)
        let header = dataHeader(senderPublicKey: senderPublicKey, handshakeID: handshakeID, nonce: nonce)
        let ciphertext = try seal(
            key: SymmetricKey(data: sessionKey),
            nonce: nonce,
            aad: header,
            plaintext: message
        )
        var note = Data(header)
        note.append(ciphertext)
        guard note.count <= ChatEnvelope.maxNoteSize else {
            throw ChatError.invalidEnvelope("PQ message note is \(note.count) bytes")
        }
        return note
    }

    /// Opens a `0x05` note. A flipped ciphertext byte fails closed.
    public func decrypt(_ note: Data) throws -> String {
        guard Self.isMessage(note) else {
            throw ChatError.invalidEnvelope("Not a PQ message")
        }
        let bytes = [UInt8](note)
        let sender = Data(bytes[2..<34])
        let handshake = Data(bytes[34..<66])
        let nonce = Data(bytes[66..<PQProtocol.messageHeaderSize])
        let ciphertext = Data(bytes[PQProtocol.messageHeaderSize...])
        guard handshake == handshakeID else {
            throw ChatError.decryptionFailed("Message is for a different handshake")
        }
        guard sender == senderPublicKey else {
            throw ChatError.decryptionFailed("Message sender does not match the handshake")
        }
        let header = Data(bytes[..<PQProtocol.messageHeaderSize])
        let plaintext: Data
        do {
            plaintext = try open(
                key: SymmetricKey(data: sessionKey),
                nonce: nonce,
                aad: header,
                ciphertextAndTag: ciphertext
            )
        } catch {
            throw ChatError.decryptionFailed("PQ message authentication failed")
        }
        guard let message = String(data: plaintext, encoding: .utf8) else {
            throw ChatError.decryptionFailed("Decrypted data is not valid UTF-8")
        }
        return message
    }
}

// MARK: - ML-KEM

@available(macOS 26, iOS 26, watchOS 26, tvOS 26, visionOS 26, macCatalyst 26, *)
private enum MLKEM {
    static func privateKey(fromAccountSeed seed: Data) throws -> MLKEM768.PrivateKey {
        try requireCount("account seed", seed, 32)
        let salt = Data("AlgoChat-v1-mlkem768".utf8)
        let d = hkdf(ikm: seed, salt: salt, info: Data("mlkem768-d".utf8))
        let z = hkdf(ikm: seed, salt: salt, info: Data("mlkem768-z".utf8))
        var dz = Data()
        dz.append(d)
        dz.append(z)
        do {
            return try MLKEM768.PrivateKey(seedRepresentation: dz, publicKey: nil)
        } catch {
            throw ChatError.keyDerivationFailed("ML-KEM-768 key generation failed: \(error)")
        }
    }

    static func encapsulate(_ encapsKey: Data) throws -> (ciphertext: Data, sharedSecret: Data) {
        try requireCount("encapsulation key", encapsKey, PQProtocol.encapsKeySize)
        let publicKey = try MLKEM768.PublicKey(rawRepresentation: encapsKey)
        let result = try publicKey.encapsulate()
        let ciphertext = Data([UInt8](result.encapsulated))
        let sharedSecret = result.sharedSecret.withUnsafeBytes { Data($0) }
        guard ciphertext.count == PQProtocol.ciphertextSize, sharedSecret.count == 32 else {
            throw ChatError.keyDerivationFailed(
                "ML-KEM encapsulation returned \(ciphertext.count) and \(sharedSecret.count) bytes"
            )
        }
        return (ciphertext, sharedSecret)
    }

    static func decapsulate(_ ciphertext: Data, privateKey: MLKEM768.PrivateKey) throws -> Data {
        try requireCount("ML-KEM ciphertext", ciphertext, PQProtocol.ciphertextSize)
        let secret: SymmetricKey
        do {
            secret = try privateKey.decapsulate(ciphertext)
        } catch {
            throw ChatError.decryptionFailed("ML-KEM decapsulation failed: \(error)")
        }
        let bytes = secret.withUnsafeBytes { Data($0) }
        guard bytes.count == 32 else {
            throw ChatError.decryptionFailed("ML-KEM shared secret must be 32 bytes, got \(bytes.count)")
        }
        return bytes
    }
}

// MARK: - Handshake layout

private struct HandshakeFields {
    let senderPublicKey: Data
    let recipientPublicKey: Data
    let ephemeralPublicKey: Data
    let kemCiphertext: Data
    let encapsKeyHash: Data
    let nonce: Data
    let wrappedSessionKey: Data
}

private func parseHandshake(_ note: Data) throws -> HandshakeFields {
    guard PQSession.isHandshake(note) else {
        throw ChatError.invalidEnvelope("PQ handshake must be \(PQProtocol.handshakeSize) bytes")
    }
    let bytes = [UInt8](note)
    var offset = 2
    let senderPublicKey = slice(bytes, offset, 32)
    offset += 32
    let recipientPublicKey = slice(bytes, offset, 32)
    offset += 32
    let ephemeralPublicKey = slice(bytes, offset, 32)
    offset += 32
    let kemCiphertext = slice(bytes, offset, PQProtocol.ciphertextSize)
    offset += PQProtocol.ciphertextSize
    let encapsKeyHash = slice(bytes, offset, 32)
    offset += 32
    let nonce = slice(bytes, offset, PQProtocol.nonceSize)
    offset += PQProtocol.nonceSize
    let wrappedSessionKey = slice(bytes, offset, PQProtocol.wrappedKeySize)
    offset += PQProtocol.wrappedKeySize
    guard offset == bytes.count else {
        throw ChatError.invalidEnvelope("PQ handshake parse did not consume the note")
    }
    return HandshakeFields(
        senderPublicKey: senderPublicKey,
        recipientPublicKey: recipientPublicKey,
        ephemeralPublicKey: ephemeralPublicKey,
        kemCiphertext: kemCiphertext,
        encapsKeyHash: encapsKeyHash,
        nonce: nonce,
        wrappedSessionKey: wrappedSessionKey
    )
}

private func handshakePrefix(
    senderPublicKey: Data,
    recipientPublicKey: Data,
    ephemeralPublicKey: Data,
    kemCiphertext: Data,
    encapsKey: Data,
    nonce: Data
) -> Data {
    var prefix = Data()
    prefix.append(PQProtocol.version)
    prefix.append(PQProtocol.handshakeID)
    prefix.append(senderPublicKey)
    prefix.append(recipientPublicKey)
    prefix.append(ephemeralPublicKey)
    prefix.append(kemCiphertext)
    prefix.append(Data(SHA256.hash(data: encapsKey)))
    prefix.append(nonce)
    return prefix
}

private func dataHeader(senderPublicKey: Data, handshakeID: Data, nonce: Data) -> Data {
    var header = Data()
    header.append(PQProtocol.version)
    header.append(PQProtocol.messageID)
    header.append(senderPublicKey)
    header.append(handshakeID)
    header.append(nonce)
    return header
}

private func sessionFrom(
    _ note: Data,
    _ sessionKey: Data,
    _ senderPublicKey: Data,
    _ recipientPublicKey: Data
) -> PQSession {
    PQSession(
        sessionKey: sessionKey,
        senderPublicKey: senderPublicKey,
        recipientPublicKey: recipientPublicKey,
        handshakeID: Data(SHA256.hash(data: note))
    )
}

/// X25519(private, other) then HKDF with salt = ephemeral public and info = `AlgoChatPQ-SenderKey` || sender.
private func senderWrapKey(
    privateKey: Curve25519.KeyAgreement.PrivateKey,
    otherPublicKey: Data,
    senderPublicKey: Data,
    ephemeralPublicKey: Data
) throws -> SymmetricKey {
    let agreed = try x25519SharedSecret(privateKey, otherPublicKey)
    var info = Data("AlgoChatPQ-SenderKey".utf8)
    info.append(senderPublicKey)
    let key = hkdf(ikm: agreed, salt: ephemeralPublicKey, info: info)
    return SymmetricKey(data: key)
}

private func x25519SharedSecret(
    _ privateKey: Curve25519.KeyAgreement.PrivateKey,
    _ publicKey: Data
) throws -> Data {
    try requireCount("X25519 public key", publicKey, 32)
    let other = try Curve25519.KeyAgreement.PublicKey(rawRepresentation: publicKey)
    let shared = try privateKey.sharedSecretFromKeyAgreement(with: other)
    let bytes = shared.withUnsafeBytes { Data($0) }
    guard bytes.count == 32 else {
        throw ChatError.keyDerivationFailed("X25519 shared secret must be 32 bytes, got \(bytes.count)")
    }
    return bytes
}

private func hkdf(ikm: Data, salt: Data, info: Data) -> Data {
    let derived = HKDF<SHA256>.deriveKey(
        inputKeyMaterial: SymmetricKey(data: ikm),
        salt: salt,
        info: info,
        outputByteCount: 32
    )
    return derived.withUnsafeBytes { Data($0) }
}

private func seal(key: SymmetricKey, nonce: Data, aad: Data, plaintext: Data) throws -> Data {
    let box = try ChaChaPoly.seal(
        plaintext,
        using: key,
        nonce: try ChaChaPoly.Nonce(data: nonce),
        authenticating: aad
    )
    var out = Data()
    out.append(contentsOf: box.ciphertext)
    out.append(contentsOf: box.tag)
    return Data([UInt8](out))
}

private func open(key: SymmetricKey, nonce: Data, aad: Data, ciphertextAndTag: Data) throws -> Data {
    guard ciphertextAndTag.count >= PQProtocol.tagSize else {
        throw ChatError.decryptionFailed("Ciphertext too short")
    }
    let split = ciphertextAndTag.count - PQProtocol.tagSize
    let box = try ChaChaPoly.SealedBox(
        nonce: try ChaChaPoly.Nonce(data: nonce),
        ciphertext: ciphertextAndTag.prefix(split),
        tag: ciphertextAndTag.suffix(PQProtocol.tagSize)
    )
    return try ChaChaPoly.open(box, using: key, authenticating: aad)
}

private func slice(_ bytes: [UInt8], _ start: Int, _ count: Int) -> Data {
    Data(bytes[start..<(start + count)])
}

private func requireCount(_ name: String, _ value: Data, _ count: Int) throws {
    guard value.count == count else {
        throw ChatError.invalidPublicKey("\(name) must be \(count) bytes, got \(value.count)")
    }
}

private func randomBytes(count: Int) throws -> Data {
    var bytes = [UInt8](repeating: 0, count: count)
    #if canImport(Security)
    let status = SecRandomCopyBytes(kSecRandomDefault, count, &bytes)
    guard status == errSecSuccess else {
        throw ChatError.randomGenerationFailed
    }
    #else
    guard let urandom = FileHandle(forReadingAtPath: "/dev/urandom") else {
        throw ChatError.randomGenerationFailed
    }
    defer { try? urandom.close() }
    let randomData = urandom.readData(ofLength: count)
    guard randomData.count == count else {
        throw ChatError.randomGenerationFailed
    }
    bytes = [UInt8](randomData)
    #endif
    return Data(bytes)
}
