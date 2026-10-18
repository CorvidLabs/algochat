@preconcurrency import Crypto
import Foundation

/**
 Group mailbox notes.

 Protocol `0x06` delivers a 32-byte group key under an established hybrid
 session. Protocol `0x07` posts one message to the mailbox. The session key
 is an input to this type. It does not run a handshake, and `0x03` is not used.
 */
public enum GroupMailbox {
    public struct Membership: Sendable, Equatable {
        public let action: UInt8
        public let epoch: UInt32
        public let groupID: Data
        public let mailbox: Data
        public let groupKey: Data

        public init(action: UInt8, epoch: UInt32, groupID: Data, mailbox: Data, groupKey: Data) {
            self.action = action
            self.epoch = epoch
            self.groupID = groupID
            self.mailbox = mailbox
            self.groupKey = groupKey
        }
    }

    public struct Counter: Sendable, Equatable {
        public let epoch: UInt32
        public let counter: UInt32

        public init(epoch: UInt32, counter: UInt32) {
            self.epoch = epoch
            self.counter = counter
        }
    }

    public struct OpenedMessage: Sendable, Equatable {
        public let plaintext: Data
        public let groupID: Data
        public let epoch: UInt32
        public let counter: UInt32

        public init(plaintext: Data, groupID: Data, epoch: UInt32, counter: UInt32) {
            self.plaintext = plaintext
            self.groupID = groupID
            self.epoch = epoch
            self.counter = counter
        }
    }

    public static let version: UInt8 = 0x02
    public static let membershipID: UInt8 = 0x06
    public static let messageID: UInt8 = 0x07

    /// version, protocol, sender X25519, handshake id, nonce
    public static let membershipHeaderSize = 78

    /// action, epoch, group id, mailbox, group key
    public static let membershipPlaintextSize = 101

    public static let tagSize = 16
    public static let membershipNoteSize = membershipHeaderSize + membershipPlaintextSize + tagSize

    /// version, protocol, group id, epoch, counter, nonce
    public static let messageHeaderSize = 54

    public static let maxPlaintextSize = ChatEnvelope.maxNoteSize - messageHeaderSize - tagSize

    private static let nonceSize = 12
    private static let keySize = 32
    private static let infoLabel = Data("AlgoChat-group-v1".utf8)

    /**
     Seals a 195-byte `0x06` membership note.

     The header is the AEAD associated data. The key is the 32-byte session key.
     `action` is 1 create, 2 add, 3 remove, or 4 rekey. `epoch` is 1 through `UInt32.max`.
     */
    public static func sealGroupMembership(
        sessionKey: Data,
        senderPublicKey: Data,
        handshakeID: Data,
        action: UInt8,
        epoch: UInt32,
        groupID: Data,
        mailbox: Data,
        groupKey: Data,
        nonce: Data
    ) throws -> Data {
        try requireCount("session key", sessionKey, keySize)
        try requireCount("sender public key", senderPublicKey, keySize)
        try requireCount("handshake id", handshakeID, keySize)
        try requireCount("nonce", nonce, nonceSize)
        let plaintext = try encodeMembership(
            action: action,
            epoch: epoch,
            groupID: groupID,
            mailbox: mailbox,
            groupKey: groupKey
        )
        let header = membershipHeader(senderPublicKey: senderPublicKey, handshakeID: handshakeID, nonce: nonce)
        let sealed = try seal(key: SymmetricKey(data: sessionKey), nonce: nonce, aad: header, plaintext: plaintext)
        var note = Data(header)
        note.append(sealed)
        guard note.count == membershipNoteSize else {
            throw ChatError.invalidEnvelope("Group membership note is \(note.count) bytes")
        }
        return note
    }

    /// Opens a `0x06` note with the session key that sealed it.
    public static func openGroupMembership(
        note: Data,
        sessionKey: Data,
        senderPublicKey: Data,
        handshakeID: Data
    ) throws -> Membership {
        try requireCount("session key", sessionKey, keySize)
        try requireCount("sender public key", senderPublicKey, keySize)
        try requireCount("handshake id", handshakeID, keySize)
        let bytes = [UInt8](note)
        guard isMembership(bytes) else {
            throw ChatError.invalidEnvelope("Not a group membership note")
        }
        let sender = try slice(bytes, 2, keySize)
        let handshake = try slice(bytes, 34, keySize)
        let nonce = try slice(bytes, 66, nonceSize)
        guard sender == senderPublicKey else {
            throw ChatError.invalidEnvelope("Membership sender does not match the session")
        }
        guard handshake == handshakeID else {
            throw ChatError.invalidEnvelope("Membership is for a different handshake")
        }
        let header = Data(bytes[..<membershipHeaderSize])
        let sealed = Data(bytes[membershipHeaderSize...])
        let plaintext: Data
        do {
            plaintext = try open(key: SymmetricKey(data: sessionKey), nonce: nonce, aad: header, sealed: sealed)
        } catch {
            throw authenticationFailed("Group membership")
        }
        return try decodeMembership(plaintext)
    }

    /**
     Derives the 32-byte `0x07` message key.

     HKDF-SHA256 salt is epoch and counter, each 4 bytes, big-endian.
     Input key material is the group key. Info is `AlgoChat-group-v1`, the group id,
     and the sender address.
     */
    public static func deriveGroupMessageKey(
        groupKey: Data,
        epoch: UInt32,
        counter: UInt32,
        groupID: Data,
        senderAddress: Data
    ) throws -> Data {
        try requireCount("group key", groupKey, keySize)
        try requireCount("group id", groupID, keySize)
        try requireCount("sender address", senderAddress, keySize)
        try requireEpoch(epoch)
        let salt = bigEndian(epoch) + bigEndian(counter)
        var info = Data(infoLabel)
        info.append(groupID)
        info.append(senderAddress)
        let derived = HKDF<SHA256>.deriveKey(
            inputKeyMaterial: SymmetricKey(data: groupKey),
            salt: salt,
            info: info,
            outputByteCount: keySize
        )
        let key = derived.withUnsafeBytes { Data($0) }
        guard key.count == keySize else {
            throw ChatError.keyDerivationFailed("Group message KDF returned \(key.count) bytes")
        }
        return key
    }

    /// Seals a `0x07` note. The header is the AEAD associated data. Plaintext max is 4026 bytes.
    public static func sealGroupMessage(
        plaintext: Data,
        groupKey: Data,
        groupID: Data,
        epoch: UInt32,
        counter: UInt32,
        senderAddress: Data,
        nonce: Data
    ) throws -> Data {
        guard plaintext.count <= maxPlaintextSize else {
            throw ChatError.messageTooLarge(maxSize: maxPlaintextSize)
        }
        try requireCount("nonce", nonce, nonceSize)
        let messageKey = try deriveGroupMessageKey(
            groupKey: groupKey,
            epoch: epoch,
            counter: counter,
            groupID: groupID,
            senderAddress: senderAddress
        )
        let header = messageHeader(groupID: groupID, epoch: epoch, counter: counter, nonce: nonce)
        let sealed = try seal(key: SymmetricKey(data: messageKey), nonce: nonce, aad: header, plaintext: plaintext)
        var note = Data(header)
        note.append(sealed)
        guard note.count <= ChatEnvelope.maxNoteSize else {
            throw ChatError.invalidEnvelope("Group message note is \(note.count) bytes")
        }
        return note
    }

    /**
     Opens a `0x07` note.

     `accepted` lists counters already taken for this sender. The same epoch and
     counter is rejected before decryption.
     */
    public static func openGroupMessage(
        note: Data,
        groupKey: Data,
        senderAddress: Data,
        accepted: [Counter]
    ) throws -> OpenedMessage {
        let bytes = [UInt8](note)
        guard isMessage(bytes) else {
            throw ChatError.invalidEnvelope("Not a group message")
        }
        let groupID = try slice(bytes, 2, keySize)
        let epoch = try readBigEndian(bytes, at: 34)
        let counter = try readBigEndian(bytes, at: 38)
        let nonce = try slice(bytes, 42, nonceSize)
        try requireEpoch(epoch)
        if accepted.contains(where: { $0.epoch == epoch && $0.counter == counter }) {
            throw ChatError.decryptionFailed("repeated group counter")
        }
        let messageKey = try deriveGroupMessageKey(
            groupKey: groupKey,
            epoch: epoch,
            counter: counter,
            groupID: groupID,
            senderAddress: senderAddress
        )
        let header = Data(bytes[..<messageHeaderSize])
        let sealed = Data(bytes[messageHeaderSize...])
        let plaintext: Data
        do {
            plaintext = try open(key: SymmetricKey(data: messageKey), nonce: nonce, aad: header, sealed: sealed)
        } catch {
            throw authenticationFailed("Group message")
        }
        return OpenedMessage(plaintext: plaintext, groupID: groupID, epoch: epoch, counter: counter)
    }

    // MARK: - Membership plaintext

    private static func encodeMembership(
        action: UInt8,
        epoch: UInt32,
        groupID: Data,
        mailbox: Data,
        groupKey: Data
    ) throws -> Data {
        guard action == 1 || action == 2 || action == 3 || action == 4 else {
            throw ChatError.invalidEnvelope("Group action must be 1, 2, 3, or 4")
        }
        try requireEpoch(epoch)
        try requireCount("group id", groupID, keySize)
        try requireCount("mailbox", mailbox, keySize)
        try requireCount("group key", groupKey, keySize)
        var out = Data()
        out.reserveCapacity(membershipPlaintextSize)
        out.append(action)
        out.append(bigEndian(epoch))
        out.append(groupID)
        out.append(mailbox)
        out.append(groupKey)
        guard out.count == membershipPlaintextSize else {
            throw ChatError.invalidEnvelope("Group membership plaintext is \(out.count) bytes")
        }
        return out
    }

    private static func decodeMembership(_ plaintext: Data) throws -> Membership {
        guard plaintext.count == membershipPlaintextSize else {
            throw ChatError.invalidEnvelope("Group membership plaintext is the wrong length")
        }
        let bytes = [UInt8](plaintext)
        let action = bytes[0]
        let epoch = try readBigEndian(bytes, at: 1)
        let membership = Membership(
            action: action,
            epoch: epoch,
            groupID: try slice(bytes, 5, keySize),
            mailbox: try slice(bytes, 37, keySize),
            groupKey: try slice(bytes, 69, keySize)
        )
        _ = try encodeMembership(
            action: membership.action,
            epoch: membership.epoch,
            groupID: membership.groupID,
            mailbox: membership.mailbox,
            groupKey: membership.groupKey
        )
        return membership
    }

    private static func membershipHeader(senderPublicKey: Data, handshakeID: Data, nonce: Data) -> Data {
        var header = Data()
        header.reserveCapacity(membershipHeaderSize)
        header.append(version)
        header.append(membershipID)
        header.append(senderPublicKey)
        header.append(handshakeID)
        header.append(nonce)
        return header
    }

    private static func messageHeader(groupID: Data, epoch: UInt32, counter: UInt32, nonce: Data) -> Data {
        var header = Data()
        header.reserveCapacity(messageHeaderSize)
        header.append(version)
        header.append(messageID)
        header.append(groupID)
        header.append(bigEndian(epoch))
        header.append(bigEndian(counter))
        header.append(nonce)
        return header
    }

    // MARK: - AEAD

    private static func seal(key: SymmetricKey, nonce: Data, aad: Data, plaintext: Data) throws -> Data {
        let box = try ChaChaPoly.seal(
            plaintext,
            using: key,
            nonce: try ChaChaPoly.Nonce(data: nonce),
            authenticating: aad
        )
        var out = Data()
        out.append(contentsOf: box.ciphertext)
        out.append(contentsOf: box.tag)
        return out
    }

    private static func open(key: SymmetricKey, nonce: Data, aad: Data, sealed: Data) throws -> Data {
        guard sealed.count >= tagSize else {
            throw authenticationFailed("Group")
        }
        let split = sealed.count - tagSize
        let box = try ChaChaPoly.SealedBox(
            nonce: try ChaChaPoly.Nonce(data: nonce),
            ciphertext: sealed.prefix(split),
            tag: sealed.suffix(tagSize)
        )
        return try ChaChaPoly.open(box, using: key, authenticating: aad)
    }

    private static func authenticationFailed(_ what: String) -> ChatError {
        ChatError.decryptionFailed("\(what) authentication failed")
    }

    // MARK: - Bytes

    private static func isMembership(_ bytes: [UInt8]) -> Bool {
        bytes.count == membershipNoteSize && bytes[0] == version && bytes[1] == membershipID
    }

    private static func isMessage(_ bytes: [UInt8]) -> Bool {
        bytes.count >= messageHeaderSize + tagSize
            && bytes.count <= ChatEnvelope.maxNoteSize
            && bytes[0] == version
            && bytes[1] == messageID
    }

    private static func requireEpoch(_ epoch: UInt32) throws {
        guard epoch >= 1 else {
            throw ChatError.invalidEnvelope("Group epoch must be from 1 through 4294967295")
        }
    }

    private static func requireCount(_ name: String, _ value: Data, _ count: Int) throws {
        guard value.count == count else {
            throw ChatError.invalidEnvelope("\(name) must be \(count) bytes, got \(value.count)")
        }
    }

    private static func bigEndian(_ value: UInt32) -> Data {
        Data([
            UInt8(truncatingIfNeeded: value >> 24),
            UInt8(truncatingIfNeeded: value >> 16),
            UInt8(truncatingIfNeeded: value >> 8),
            UInt8(truncatingIfNeeded: value),
        ])
    }

    private static func readBigEndian(_ bytes: [UInt8], at offset: Int) throws -> UInt32 {
        guard offset >= 0, bytes.count >= 4, offset <= bytes.count - 4 else {
            throw ChatError.invalidEnvelope("truncated integer")
        }
        return UInt32(bytes[offset]) << 24
            | UInt32(bytes[offset + 1]) << 16
            | UInt32(bytes[offset + 2]) << 8
            | UInt32(bytes[offset + 3])
    }

    private static func slice(_ bytes: [UInt8], _ start: Int, _ count: Int) throws -> Data {
        guard start >= 0, count >= 0, bytes.count >= count, start <= bytes.count - count else {
            throw ChatError.invalidEnvelope("truncated note")
        }
        return Data(bytes[start..<(start + count)])
    }
}
