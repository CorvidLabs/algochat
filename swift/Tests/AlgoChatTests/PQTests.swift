@preconcurrency import Crypto
import Foundation
import Testing
@testable import AlgoChat

@Suite("PQ")
struct PQTests {
    private static let pinnedCombiner = "9b393e8cec553ada4821c1fa04b40bf499446b19ca9218fd8dcf8b705e06d734"

    @Test("wire sizes stay 2366 and 78 and do not use 0x03")
    func wireSizes() {
        #expect(PQProtocol.version == 0x02)
        #expect(PQProtocol.handshakeID == 0x04)
        #expect(PQProtocol.messageID == 0x05)
        #expect(PQProtocol.handshakeID != 0x03)
        #expect(PQProtocol.messageID != 0x03)
        #expect(PQProtocol.handshakeSize == 2366)
        #expect(PQProtocol.messageHeaderSize == 78)
        #expect(PQProtocol.maxPayloadSize == 4002)
        #expect(
            2 + 32 + 32 + 32 + PQProtocol.ciphertextSize + 32 + PQProtocol.ciphertextSize + 12
                + PQProtocol.wrappedKeySize
                == PQProtocol.handshakeSize
        )
    }

    @Test("hybrid KDF matches the pinned combiner")
    func hybridCombiner() throws {
        let fixture = try loadFixture()
        #expect(fixture.combiner_session_key == Self.pinnedCombiner)
        let encapsKey = try data(hex: fixture.encaps_key)
        let key = try PQSession.deriveHybridKey(
            x25519SharedSecret: Data(repeating: 0x05, count: 32),
            mlkemSharedSecret: Data(repeating: 0x06, count: 32),
            ephemeralPublicKey: Data(repeating: 0x01, count: 32),
            kemCiphertext: Data(repeating: 0x02, count: PQProtocol.ciphertextSize),
            senderPublicKey: Data(repeating: 0x03, count: 32),
            recipientPublicKey: Data(repeating: 0x04, count: 32),
            encapsKey: encapsKey
        )
        #expect(hex(key) == Self.pinnedCombiner)

        var flipped = [UInt8](repeating: 0x02, count: PQProtocol.ciphertextSize)
        flipped[0] ^= 1
        let other = try PQSession.deriveHybridKey(
            x25519SharedSecret: Data(repeating: 0x05, count: 32),
            mlkemSharedSecret: Data(repeating: 0x06, count: 32),
            ephemeralPublicKey: Data(repeating: 0x01, count: 32),
            kemCiphertext: Data(flipped),
            senderPublicKey: Data(repeating: 0x03, count: 32),
            recipientPublicKey: Data(repeating: 0x04, count: 32),
            encapsKey: encapsKey
        )
        #expect(other != key)
    }

    @Test("ACPQ notes are not X25519 keys")
    func acpqIsNotX25519() throws {
        let encapsKey = Data(repeating: 0xAB, count: PQProtocol.encapsKeySize)
        let unsigned = try PQAnnouncement.encode(encapsKey: encapsKey)
        #expect(PQAnnouncement.isAnnouncement(unsigned))
        #expect(PQAnnouncement.parse(unsigned)?.isVerified == false)
        #expect(PQAnnouncement.parse(unsigned)?.encapsKey == encapsKey)
        #expect(!EnvelopeDecoder.isChatMessage(unsigned))

        let account = try ChatAccount()
        #expect(try MessageIndexer.extractKey(from: unsigned, senderAddress: account.address) == nil)

        let signingKey = Curve25519.Signing.PrivateKey()
        let signed = try PQAnnouncement.encode(encapsKey: encapsKey, signingKey: signingKey)
        #expect(signed.count <= ChatEnvelope.maxNoteSize)
        #expect(PQAnnouncement.parse(signed) == nil)
        let verified = PQAnnouncement.parse(signed, ed25519PublicKey: signingKey.publicKey.rawRepresentation)
        #expect(verified?.isVerified == true)
        #expect(verified?.encapsKey == encapsKey)

        let other = Curve25519.Signing.PrivateKey()
        #expect(PQAnnouncement.parse(signed, ed25519PublicKey: other.publicKey.rawRepresentation) == nil)
        #expect(try MessageIndexer.extractKey(from: signed, senderAddress: account.address) == nil)

        var junk = unsigned
        junk.append(Data(repeating: 0x01, count: 64))
        #expect(PQAnnouncement.parse(junk, ed25519PublicKey: signingKey.publicKey.rawRepresentation) == nil)
    }

    @Test("ML-KEM-768 key and decapsulation match the TypeScript fixture")
    @available(macOS 26, iOS 26, watchOS 26, tvOS 26, visionOS 26, macCatalyst 26, *)
    func mlkemMatchesFixture() throws {
        let fixture = try loadFixture()
        let kem = try PQSession.encapsulationPrivateKey(fromAccountSeed: Data(repeating: 0x22, count: 32))
        #expect(kem.publicKey.rawRepresentation.count == PQProtocol.encapsKeySize)
        #expect(hex(Data([UInt8](kem.publicKey.rawRepresentation))) == fixture.encaps_key)

        // encapsulate() cannot take coins, so the fixture ciphertext is decapsulated.
        let ciphertext = try data(hex: fixture.ciphertext)
        let secret = try kem.decapsulate(ciphertext)
        #expect(hex(secret.withUnsafeBytes { Data($0) }) == fixture.mlkem_shared_secret)
    }

    @Test("accepts the TypeScript handshake, reopens it, and fails a flipped byte")
    @available(macOS 26, iOS 26, watchOS 26, tvOS 26, visionOS 26, macCatalyst 26, *)
    func acceptsTypeScriptHandshake() throws {
        let alice = try KeyDerivation.deriveEncryptionKeys(fromSeed: Data(repeating: 0x11, count: 32))
        let bob = try KeyDerivation.deriveEncryptionKeys(fromSeed: Data(repeating: 0x22, count: 32))
        let aliceKem = try PQSession.encapsulationPrivateKey(fromAccountSeed: Data(repeating: 0x11, count: 32))
        let kem = try PQSession.encapsulationPrivateKey(fromAccountSeed: Data(repeating: 0x22, count: 32))
        let built = try PQSession.initiate(
            senderPrivateKey: alice.privateKey,
            recipientPublicKey: bob.publicKey,
            recipientEncapsKey: kem.publicKey.rawRepresentation,
            senderKemKey: aliceKem
        )
        let note = built.note
        let bytes = [UInt8](note)
        #expect(note.count == 2366)
        #expect(PQSession.isHandshake(note))
        #expect(bytes[0] == 0x02)
        #expect(bytes[1] == 0x04)
        #expect(!EnvelopeDecoder.isChatMessage(note))
        #expect(Data(bytes[2..<34]) == alice.publicKey.rawRepresentation)
        #expect(Data(bytes[34..<66]) == bob.publicKey.rawRepresentation)

        let session = try PQSession.accept(
            note: note,
            recipientPrivateKey: bob.privateKey,
            kemPrivateKey: kem
        )
        #expect(session.sessionKey == built.session.sessionKey)

        let reopened = try PQSession.openAsSender(
            note: note,
            senderPrivateKey: alice.privateKey,
            senderKemKey: aliceKem
        )
        #expect(reopened.sessionKey == session.sessionKey)
        #expect(reopened.handshakeID == session.handshakeID)
        #expect(throws: ChatError.self) {
            _ = try PQSession.openAsSender(
                note: note,
                senderPrivateKey: alice.privateKey,
                senderKemKey: kem
            )
        }

        let message = try session.encrypt("parity")
        #expect(PQSession.isMessage(message))
        #expect([UInt8](message)[0] == 0x02)
        #expect([UInt8](message)[1] == 0x05)
        #expect(try reopened.decrypt(message) == "parity")

        let short = try session.encrypt("abc")
        #expect(short.count == 97)

        var tampered = [UInt8](message)
        tampered[tampered.count - 1] ^= 0x01
        #expect(throws: ChatError.self) {
            _ = try session.decrypt(Data(tampered))
        }
        var body = [UInt8](message)
        body[PQProtocol.messageHeaderSize] ^= 0x01
        #expect(throws: ChatError.self) {
            _ = try session.decrypt(Data(body))
        }

        var notHandshake = bytes
        notHandshake[1] = 0x03
        #expect(!PQSession.isHandshake(Data(notHandshake)))
        #expect(throws: ChatError.self) {
            _ = try PQSession.accept(
                note: Data(notHandshake),
                recipientPrivateKey: bob.privateKey,
                kemPrivateKey: kem
            )
        }
    }

    @Test("a built handshake round-trips and rejects an oversized message")
    @available(macOS 26, iOS 26, watchOS 26, tvOS 26, visionOS 26, macCatalyst 26, *)
    func initiateRoundTrip() throws {
        let alice = try KeyDerivation.deriveEncryptionKeys(fromSeed: Data(repeating: 0x11, count: 32))
        let bob = try KeyDerivation.deriveEncryptionKeys(fromSeed: Data(repeating: 0x22, count: 32))
        let kem = try PQSession.encapsulationPrivateKey(fromAccountSeed: Data(repeating: 0x22, count: 32))
        let aliceKem = try PQSession.encapsulationPrivateKey(fromAccountSeed: Data(repeating: 0x11, count: 32))
        let opened = try PQSession.initiate(
            senderPrivateKey: alice.privateKey,
            recipientPublicKey: bob.publicKey,
            recipientEncapsKey: kem.publicKey.rawRepresentation,
            senderKemKey: aliceKem
        )
        #expect(opened.note.count == PQProtocol.handshakeSize)
        #expect([UInt8](opened.note)[0] == PQProtocol.version)
        #expect([UInt8](opened.note)[1] == PQProtocol.handshakeID)

        let accepted = try PQSession.accept(
            note: opened.note,
            recipientPrivateKey: bob.privateKey,
            kemPrivateKey: kem
        )
        let reopened = try PQSession.openAsSender(
            note: opened.note,
            senderPrivateKey: alice.privateKey,
            senderKemKey: aliceKem
        )
        #expect(accepted.sessionKey == opened.session.sessionKey)
        #expect(reopened.sessionKey == opened.session.sessionKey)

        let note = try opened.session.encrypt("quantum hello")
        #expect(try accepted.decrypt(note) == "quantum hello")
        #expect(note.count <= ChatEnvelope.maxNoteSize)

        let full = String(repeating: "x", count: PQProtocol.maxPayloadSize)
        let fullNote = try opened.session.encrypt(full)
        #expect(fullNote.count <= ChatEnvelope.maxNoteSize)
        #expect(try accepted.decrypt(fullNote) == full)
        #expect(throws: ChatError.self) {
            _ = try opened.session.encrypt(String(repeating: "x", count: PQProtocol.maxPayloadSize + 1))
        }
    }
}

private struct PQFixture: Decodable {
    let encaps_key: String
    let ciphertext: String
    let mlkem_shared_secret: String
    let combiner_session_key: String
    let handshake_note: String
    let handshake_session_key: String
    let handshake_bytes: Int
}

private func loadFixture() throws -> PQFixture {
    let url = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent("vectors/pq-mlkem768.json")
    let data = try Data(contentsOf: url)
    return try JSONDecoder().decode(PQFixture.self, from: data)
}

private func data(hex: String) throws -> Data {
    guard hex.count.isMultiple(of: 2) else {
        throw ChatError.invalidEnvelope("Odd hex length")
    }
    var out = Data()
    out.reserveCapacity(hex.count / 2)
    var index = hex.startIndex
    while index < hex.endIndex {
        let next = hex.index(index, offsetBy: 2)
        guard let byte = UInt8(hex[index..<next], radix: 16) else {
            throw ChatError.invalidEnvelope("Bad hex")
        }
        out.append(byte)
        index = next
    }
    return out
}

private func hex(_ data: Data) -> String {
    data.map { String(format: "%02x", $0) }.joined()
}
