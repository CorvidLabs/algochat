import Foundation

/**
 The wire format for encrypted messages stored in transaction notes

 **Format** - Per-message key separation with bidirectional decryption, without forward secrecy:
 - Version: 1 byte (0x01 for empty payload AAD, 0x02 for full-header payload AAD)
 - Protocol: 1 byte (0x01 = AlgoChat)
 - Sender Static Public Key: 32 bytes (X25519)
 - Sender Ephemeral Public Key: 32 bytes (X25519)
 - Nonce: 12 bytes (ChaCha20-Poly1305)
 - Encrypted Sender Key: 48 bytes (symmetric key encrypted for sender + tag)
 - Ciphertext + Tag: remaining bytes
 - Overhead: 142 bytes (126-byte header + 16-byte tag)
 - Maximum plaintext is the note ceiling minus the header and tag
 - Both sender and recipient can decrypt their own messages
 */
public struct ChatEnvelope: Sendable {
    // MARK: - Constants

    /// Default version emitted by this implementation; readers also accept 0x02
    public static let version: UInt8 = 0x01

    /// AlgoChat protocol identifier
    public static let protocolID: UInt8 = 0x01

    /// Algorand consensus note ceiling, in bytes. Shared by every envelope.
    public static let maxNoteSize = 4096

    /// Size of the header (version + protocol + static pubkey + ephemeral pubkey + nonce + encrypted sender key)
    public static let headerSize = 126

    /// Size of the encrypted sender key (32-byte key + 16-byte tag)
    public static let encryptedSenderKeySize = 48

    /// Size of the Poly1305 authentication tag
    public static let tagSize = 16

    /// Maximum size of the plaintext payload
    public static let maxPayloadSize = maxNoteSize - headerSize - tagSize

    // MARK: - Properties

    /// Sender's static X25519 public key for key discovery; sender identity comes from the signed payment
    public let senderPublicKey: Data

    /// Sender's ephemeral X25519 public key for per-message key separation
    public let ephemeralPublicKey: Data

    /// Encrypted symmetric key for sender decryption
    /// This allows the sender to decrypt their own messages
    public let encryptedSenderKey: Data

    /// Nonce used for encryption
    public let nonce: Data

    /// Encrypted message with authentication tag
    public let ciphertext: Data

    /// Envelope version. `0x01` has empty associated data. `0x02` binds the full header.
    public let envelopeVersion: UInt8

    // MARK: - Initialization

    /**
     Creates an envelope with per-message key separation and bidirectional decryption

     - Precondition: `senderPublicKey` must be 32 bytes (X25519 public key)
     - Precondition: `ephemeralPublicKey` must be 32 bytes (X25519 public key)
     - Precondition: `encryptedSenderKey` must be 48 bytes (32-byte key + 16-byte tag)
     - Precondition: `nonce` must be 12 bytes (ChaCha20-Poly1305 nonce)
     */
    public init(
        senderPublicKey: Data,
        ephemeralPublicKey: Data,
        encryptedSenderKey: Data,
        nonce: Data,
        ciphertext: Data,
        envelopeVersion: UInt8 = ChatEnvelope.version
    ) {
        precondition(senderPublicKey.count == 32, "Sender public key must be 32 bytes")
        precondition(ephemeralPublicKey.count == 32, "Ephemeral public key must be 32 bytes")
        precondition(encryptedSenderKey.count == 48, "Encrypted sender key must be 48 bytes")
        precondition(nonce.count == 12, "Nonce must be 12 bytes")
        // Re-base every field to a zero-indexed Data. CryptoKit sealed-box
        // outputs (and Data slice concatenation) can carry a non-zero
        // startIndex, which makes integer subscripting like `ciphertext[0]`
        // trap. Normalizing here keeps the public Data fields safe to index.
        self.senderPublicKey = Data([UInt8](senderPublicKey))
        self.ephemeralPublicKey = Data([UInt8](ephemeralPublicKey))
        self.encryptedSenderKey = Data([UInt8](encryptedSenderKey))
        self.nonce = Data([UInt8](nonce))
        self.ciphertext = Data([UInt8](ciphertext))
        self.envelopeVersion = envelopeVersion
    }

    // MARK: - Encoding

    /// The 126-byte header. Version 0x02 uses it as payload associated data.
    public func headerData() -> Data {
        var data = Data()
        data.append(envelopeVersion)
        data.append(Self.protocolID)
        data.append(senderPublicKey)
        data.append(ephemeralPublicKey)
        data.append(nonce)
        data.append(encryptedSenderKey)
        return data
    }

    /// Serializes to bytes for transaction note
    public func encode() -> Data {
        var data = Data()
        data.append(envelopeVersion)
        data.append(Self.protocolID)
        data.append(senderPublicKey)
        data.append(ephemeralPublicKey)
        data.append(nonce)
        data.append(encryptedSenderKey)
        data.append(ciphertext)
        return data
    }

    // MARK: - Decoding

    /// Deserializes from transaction note bytes
    public static func decode(from data: Data) throws -> ChatEnvelope {
        guard data.count >= 2 else {
            throw ChatError.invalidEnvelope("Data too short: \(data.count) bytes")
        }

        let versionByte = data[0]
        let protocolByte = data[1]

        guard protocolByte == protocolID else {
            throw ChatError.unsupportedProtocol(protocolByte)
        }

        guard versionByte == version || versionByte == 0x02 else {
            throw ChatError.unsupportedVersion(versionByte)
        }

        guard data.count >= headerSize + tagSize else {
            throw ChatError.invalidEnvelope("Data too short: \(data.count) bytes")
        }

        let senderPublicKey = data[2..<34]
        let ephemeralPublicKey = data[34..<66]
        let nonce = data[66..<78]
        let encryptedSenderKey = data[78..<126]
        let ciphertext = data[126...]

        return ChatEnvelope(
            senderPublicKey: Data(senderPublicKey),
            ephemeralPublicKey: Data(ephemeralPublicKey),
            encryptedSenderKey: Data(encryptedSenderKey),
            nonce: Data(nonce),
            ciphertext: Data(ciphertext),
            envelopeVersion: versionByte
        )
    }
}
