import Foundation
import Testing
@testable import AlgoChat

@Suite("GroupMailbox")
struct GroupMailboxTests {
    @Test("matches the frozen 0x06 and 0x07 notes")
    func matchesFrozenNotes() throws {
        let vector = try loadVector()
        let sessionKey = try data(hex: vector.session_key)
        let sender = try data(hex: vector.sender_x25519)
        let handshakeID = try data(hex: vector.handshake_id)
        let groupID = try data(hex: vector.group_id)
        let mailbox = try data(hex: vector.mailbox)
        let groupKey = try data(hex: vector.group_key)
        let epoch = try uint32(vector.epoch)
        let counter = try uint32(vector.counter)
        let action = try uint8(vector.action)

        let membership = try GroupMailbox.sealGroupMembership(
            sessionKey: sessionKey,
            senderPublicKey: sender,
            handshakeID: handshakeID,
            action: action,
            epoch: epoch,
            groupID: groupID,
            mailbox: mailbox,
            groupKey: groupKey,
            nonce: try data(hex: vector.membership_nonce)
        )
        #expect(hex(membership) == vector.membership_note)
        #expect(membership.count == GroupMailbox.membershipNoteSize)
        #expect(membership.count == 195)
        #expect(membership.first == 0x02)
        #expect(membership.dropFirst().first == 0x06)

        let opened = try GroupMailbox.openGroupMembership(
            note: membership,
            sessionKey: sessionKey,
            senderPublicKey: sender,
            handshakeID: handshakeID
        )
        #expect(opened.action == 1)
        #expect(opened.epoch == 1)
        #expect(opened.groupID == groupID)
        #expect(opened.mailbox == mailbox)
        #expect(opened.groupKey == groupKey)

        let messageKey = try GroupMailbox.deriveGroupMessageKey(
            groupKey: groupKey,
            epoch: epoch,
            counter: counter,
            groupID: groupID,
            senderAddress: try data(hex: vector.sender_address)
        )
        #expect(hex(messageKey) == vector.message_key)

        let plaintext = Data(vector.plaintext_utf8.utf8)
        let message = try GroupMailbox.sealGroupMessage(
            plaintext: plaintext,
            groupKey: groupKey,
            groupID: groupID,
            epoch: epoch,
            counter: counter,
            senderAddress: try data(hex: vector.sender_address),
            nonce: try data(hex: vector.message_nonce)
        )
        #expect(hex(message) == vector.message_note)
        #expect(message.first == 0x02)
        #expect(message.dropFirst().first == 0x07)

        let plain = try GroupMailbox.openGroupMessage(
            note: message,
            groupKey: groupKey,
            senderAddress: try data(hex: vector.sender_address),
            accepted: []
        )
        #expect(plain.plaintext == plaintext)
        #expect(plain.epoch == epoch)
        #expect(plain.counter == counter)
        #expect(plain.groupID == groupID)
        #expect(GroupMailbox.maxPlaintextSize == 4026)
        #expect(GroupMailbox.messageHeaderSize == 54)
        #expect(GroupMailbox.membershipHeaderSize == 78)
    }

    @Test("rejects a repeated counter and an authentication failure")
    func rejectsReplayAndForgery() throws {
        let vector = try loadVector()
        let note = try data(hex: vector.message_note)
        let groupKey = try data(hex: vector.group_key)
        let sender = try data(hex: vector.sender_address)
        let epoch = try uint32(vector.epoch)
        let counter = try uint32(vector.counter)

        let otherCounter = try GroupMailbox.openGroupMessage(
            note: note,
            groupKey: groupKey,
            senderAddress: sender,
            accepted: [GroupMailbox.Counter(epoch: epoch, counter: counter &+ 1)]
        )
        #expect(otherCounter.counter == counter)

        try expectDescription("repeated") {
            _ = try GroupMailbox.openGroupMessage(
                note: note,
                groupKey: groupKey,
                senderAddress: sender,
                accepted: [GroupMailbox.Counter(epoch: epoch, counter: counter)]
            )
        }

        var flipped = note
        guard let last = flipped.indices.last else {
            throw ChatError.invalidEnvelope("empty note")
        }
        flipped[last] ^= 0x01
        try expectDescription("authentication") {
            _ = try GroupMailbox.openGroupMessage(
                note: flipped,
                groupKey: groupKey,
                senderAddress: sender,
                accepted: []
            )
        }

        let previous = Data(repeating: 0x98, count: 32)
        try expectDescription("authentication") {
            _ = try GroupMailbox.openGroupMessage(
                note: note,
                groupKey: previous,
                senderAddress: sender,
                accepted: []
            )
        }

        var badMembership = try data(hex: vector.membership_note)
        guard let tag = badMembership.indices.last else {
            throw ChatError.invalidEnvelope("empty note")
        }
        badMembership[tag] ^= 0x01
        try expectDescription("authentication") {
            _ = try GroupMailbox.openGroupMembership(
                note: badMembership,
                sessionKey: try data(hex: vector.session_key),
                senderPublicKey: try data(hex: vector.sender_x25519),
                handshakeID: try data(hex: vector.handshake_id)
            )
        }
    }

    @Test("rejects epoch 0, a bad action, and a plaintext past 4026")
    func rejectsBounds() throws {
        let key = Data(repeating: 0x99, count: 32)
        let id = Data(repeating: 0x77, count: 32)
        let mailbox = Data(repeating: 0x88, count: 32)
        let sender = Data(repeating: 0x11, count: 32)
        let handshakeID = Data(repeating: 0x43, count: 32)
        let sessionKey = Data(repeating: 0x42, count: 32)
        let nonce = Data(repeating: 0x55, count: 12)
        let address = Data(repeating: 0xAA, count: 32)

        #expect(throws: ChatError.self) {
            _ = try GroupMailbox.sealGroupMembership(
                sessionKey: sessionKey,
                senderPublicKey: sender,
                handshakeID: handshakeID,
                action: 1,
                epoch: 0,
                groupID: id,
                mailbox: mailbox,
                groupKey: key,
                nonce: nonce
            )
        }
        #expect(throws: ChatError.self) {
            _ = try GroupMailbox.sealGroupMembership(
                sessionKey: sessionKey,
                senderPublicKey: sender,
                handshakeID: handshakeID,
                action: 5,
                epoch: 1,
                groupID: id,
                mailbox: mailbox,
                groupKey: key,
                nonce: nonce
            )
        }

        let full = try GroupMailbox.sealGroupMessage(
            plaintext: Data(repeating: 0x61, count: GroupMailbox.maxPlaintextSize),
            groupKey: key,
            groupID: id,
            epoch: UInt32.max,
            counter: UInt32.max,
            senderAddress: address,
            nonce: nonce
        )
        #expect(full.count == ChatEnvelope.maxNoteSize)
        let opened = try GroupMailbox.openGroupMessage(
            note: full,
            groupKey: key,
            senderAddress: address,
            accepted: []
        )
        #expect(opened.plaintext.count == GroupMailbox.maxPlaintextSize)
        #expect(opened.epoch == UInt32.max)
        #expect(opened.counter == UInt32.max)

        #expect(throws: ChatError.self) {
            _ = try GroupMailbox.sealGroupMessage(
                plaintext: Data(repeating: 0x61, count: GroupMailbox.maxPlaintextSize + 1),
                groupKey: key,
                groupID: id,
                epoch: 1,
                counter: 0,
                senderAddress: address,
                nonce: nonce
            )
        }
    }
}

private struct GroupVector: Decodable {
    let session_key: String
    let sender_x25519: String
    let handshake_id: String
    let membership_nonce: String
    let action: Int
    let epoch: Int
    let group_id: String
    let mailbox: String
    let group_key: String
    let membership_note: String
    let message_nonce: String
    let counter: Int
    let sender_address: String
    let plaintext_utf8: String
    let message_key: String
    let message_note: String
}

private func loadVector() throws -> GroupVector {
    let url = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent("vectors/group-v1.json")
    let data = try Data(contentsOf: url)
    return try JSONDecoder().decode(GroupVector.self, from: data)
}

private func expectDescription(_ needle: String, _ body: () throws -> Void) throws {
    do {
        try body()
        Issue.record("expected an error containing \(needle)")
    } catch {
        let description = String(describing: error) + " " + error.localizedDescription
        #expect(description.contains(needle))
    }
}

private func uint32(_ value: Int) throws -> UInt32 {
    guard let converted = UInt32(exactly: value) else {
        throw ChatError.invalidEnvelope("integer out of range")
    }
    return converted
}

private func uint8(_ value: Int) throws -> UInt8 {
    guard let converted = UInt8(exactly: value) else {
        throw ChatError.invalidEnvelope("integer out of range")
    }
    return converted
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
