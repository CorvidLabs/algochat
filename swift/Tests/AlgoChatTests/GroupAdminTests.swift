import Foundation
import Testing
@testable import AlgoChat

@Suite("GroupAdmin")
struct GroupAdminTests {
    @Test("matches vectors/group-admin-v1.json")
    func matchesVector() throws {
        let vector = try loadAdminVector()
        #expect(GroupMailbox.membershipPlaintextSize == 101)
        #expect(GroupMailbox.membershipNoteSize == 195)
        #expect(GroupAdmin.deliverPlaintextSize == 133)
        #expect(GroupAdmin.deliveryNoteSize == 227)

        for draft in vector.drafts {
            let note = try GroupAdmin.draft(
                state: try roomState(draft.basis_state),
                op: try uint8(draft.op),
                sender: try data(hex: draft.sender),
                subject: try data(hex: draft.subject),
                name: utf8Name(draft.name_utf8),
                policy: try optionalUInt8(draft.policy),
                groupID: try optionalHex(draft.group_id),
                mailbox: try optionalHex(draft.mailbox)
            )
            #expect(hex(note) == draft.note, "draft \(draft.name)")
        }

        for item in vector.draft_errors {
            try expectDescription(item.error_includes) {
                _ = try GroupAdmin.draft(
                    state: try roomState(item.basis_state),
                    op: try uint8(item.op),
                    sender: try data(hex: item.sender),
                    subject: try data(hex: item.subject),
                    name: utf8Name(item.name_utf8),
                    policy: try optionalUInt8(item.policy)
                )
            }
        }

        for (name, reduction) in vector.reductions {
            let result = GroupAdmin.reduce(try events(reduction.events))
            #expect(result.rejected.map(\.reason) == reduction.rejected.map(\.reason), "\(name) reasons")
            #expect(result.rejected.map { hex($0.txID) } == reduction.rejected.map(\.tx_id), "\(name) rejected ids")
            #expect(result.accepted.map { Int($0.op) } == reduction.accepted.map(\.op), "\(name) ops")
            #expect(result.accepted.map { hex($0.txID) } == reduction.accepted.map(\.tx_id), "\(name) accepted ids")
            #expect(result.accepted.map { hex($0.sender) } == reduction.accepted.map(\.sender), "\(name) senders")
            #expect(result.accepted.map { Int($0.epoch) } == reduction.accepted.map(\.epoch), "\(name) epochs")
            #expect(result.accepted.map { hex($0.subject) } == reduction.accepted.map(\.subject), "\(name) subjects")
            #expect(
                result.accepted.map { $0.members.map { hex($0) } } == reduction.accepted.map(\.members),
                "\(name) members"
            )
            try expectState(result.state, reduction.state, name)
        }

        for check in vector.checks.delivery_authorized {
            let reduction = try #require(vector.reductions[check.reduction])
            let allowed = GroupAdmin.deliveryAuthorized(
                accepted: try accepted(reduction.accepted),
                adminTxID: try data(hex: check.admin_tx_id),
                sender: try data(hex: check.sender),
                recipient: try data(hex: check.recipient),
                epoch: try uint32(check.epoch)
            )
            #expect(allowed == check.allowed, "delivery \(check.reduction)")
        }

        for check in vector.checks.may_post {
            let reduction = try #require(vector.reductions[check.reduction])
            let state = try #require(try roomState(reduction.state))
            let allowed = try GroupAdmin.senderMayPost(
                state: state,
                sender: try data(hex: check.sender),
                epoch: try uint32(check.epoch)
            )
            #expect(allowed == check.allowed, "post \(check.reduction)")
        }

        let delivery = vector.delivery
        let sessionKey = try data(hex: delivery.session_key)
        let sender = try data(hex: delivery.sender_x25519)
        let handshakeID = try data(hex: delivery.handshake_id)
        let groupID = try data(hex: delivery.group_id)
        let mailbox = try data(hex: delivery.mailbox)
        let groupKey = try data(hex: delivery.group_key)
        let adminTxID = try data(hex: delivery.admin_tx_id)
        let note = try GroupAdmin.sealKeyDelivery(
            sessionKey: sessionKey,
            senderPublicKey: sender,
            handshakeID: handshakeID,
            epoch: try uint32(delivery.epoch),
            groupID: groupID,
            mailbox: mailbox,
            groupKey: groupKey,
            adminTxID: adminTxID,
            nonce: try data(hex: delivery.nonce)
        )
        #expect(hex(note) == delivery.note)
        #expect(note.count == 227)
        let opened = try GroupAdmin.openKeyDelivery(
            note: note,
            sessionKey: sessionKey,
            senderPublicKey: sender,
            handshakeID: handshakeID
        )
        let epoch = try uint32(delivery.epoch)
        #expect(opened.epoch == epoch)
        #expect(opened.groupID == groupID)
        #expect(opened.mailbox == mailbox)
        #expect(opened.groupKey == groupKey)
        #expect(opened.adminTxID == adminTxID)
        #expect(throws: ChatError.self) {
            _ = try GroupMailbox.openGroupMembership(
                note: note,
                sessionKey: sessionKey,
                senderPublicKey: sender,
                handshakeID: handshakeID
            )
        }
    }
}

private struct AdminVector: Decodable {
    let drafts: [DraftVector]
    let draft_errors: [DraftErrorVector]
    let reductions: [String: ReductionVector]
    let checks: ChecksVector
    let delivery: DeliveryVector
}

private struct DraftVector: Decodable {
    let name: String
    let basis_state: BasisState?
    let op: Int
    let sender: String
    let subject: String
    let name_utf8: String?
    let policy: Int?
    let group_id: String?
    let mailbox: String?
    let note: String
}

private struct DraftErrorVector: Decodable {
    let basis_state: BasisState?
    let op: Int
    let sender: String
    let subject: String
    let name_utf8: String?
    let policy: Int?
    let error_includes: String
}

private struct BasisState: Decodable {
    let group_id: String
    let mailbox: String
    let owner: String
    let admins: [String]
    let members: [String]
    let pending: [String]
    let policy: Int
    let name_hex: String
    let epoch: Int
    let head_tx_id: String
}

private struct ReductionVector: Decodable {
    let events: [EventVector]
    let accepted: [AcceptedVector]
    let rejected: [RejectedVector]
    let state: BasisState?
}

private struct EventVector: Decodable {
    let note: String
    let sender: String
    let tx_id: String
    let round: Int
    let offset: Int
}

private struct AcceptedVector: Decodable {
    let tx_id: String
    let sender: String
    let op: Int
    let epoch: Int
    let subject: String
    let members: [String]
}

private struct RejectedVector: Decodable {
    let tx_id: String
    let reason: String
}

private struct ChecksVector: Decodable {
    let delivery_authorized: [DeliveryCheck]
    let may_post: [PostCheck]
}

private struct DeliveryCheck: Decodable {
    let reduction: String
    let admin_tx_id: String
    let sender: String
    let recipient: String
    let epoch: Int
    let allowed: Bool
}

private struct PostCheck: Decodable {
    let reduction: String
    let sender: String
    let epoch: Int
    let allowed: Bool
}

private struct DeliveryVector: Decodable {
    let session_key: String
    let sender_x25519: String
    let handshake_id: String
    let nonce: String
    let epoch: Int
    let group_id: String
    let mailbox: String
    let group_key: String
    let admin_tx_id: String
    let note: String
}

private func loadAdminVector() throws -> AdminVector {
    let url = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent("vectors/group-admin-v1.json")
    let data = try Data(contentsOf: url)
    return try JSONDecoder().decode(AdminVector.self, from: data)
}

private func roomState(_ basis: BasisState?) throws -> GroupAdmin.State? {
    guard let basis else { return nil }
    return GroupAdmin.State(
        groupID: try data(hex: basis.group_id),
        mailbox: try data(hex: basis.mailbox),
        owner: try data(hex: basis.owner),
        admins: try basis.admins.map { try data(hex: $0) },
        members: try basis.members.map { try data(hex: $0) },
        pending: try basis.pending.map { try data(hex: $0) },
        policy: try uint8(basis.policy),
        name: try data(hex: basis.name_hex),
        epoch: try uint32(basis.epoch),
        headTxID: try data(hex: basis.head_tx_id)
    )
}

private func events(_ items: [EventVector]) throws -> [GroupAdmin.Event] {
    try items.map { item in
        GroupAdmin.Event(
            note: try data(hex: item.note),
            sender: try data(hex: item.sender),
            txID: try data(hex: item.tx_id),
            round: item.round,
            offset: item.offset
        )
    }
}

private func accepted(_ items: [AcceptedVector]) throws -> [GroupAdmin.Accepted] {
    try items.map { item in
        GroupAdmin.Accepted(
            txID: try data(hex: item.tx_id),
            sender: try data(hex: item.sender),
            op: try uint8(item.op),
            epoch: try uint32(item.epoch),
            subject: try data(hex: item.subject),
            members: try item.members.map { try data(hex: $0) }
        )
    }
}

private func expectState(_ state: GroupAdmin.State?, _ expected: BasisState?, _ label: String) throws {
    guard let expected else {
        #expect(state == nil, "\(label)")
        return
    }
    let state = try #require(state)
    #expect(hex(state.groupID) == expected.group_id, "\(label) group_id")
    #expect(hex(state.mailbox) == expected.mailbox, "\(label) mailbox")
    #expect(hex(state.owner) == expected.owner, "\(label) owner")
    #expect(state.admins.map { hex($0) } == expected.admins, "\(label) admins")
    #expect(state.members.map { hex($0) } == expected.members, "\(label) members")
    #expect(state.pending.map { hex($0) } == expected.pending, "\(label) pending")
    #expect(Int(state.policy) == expected.policy, "\(label) policy")
    #expect(hex(state.name) == expected.name_hex, "\(label) name_hex")
    #expect(Int(state.epoch) == expected.epoch, "\(label) epoch")
    #expect(hex(state.headTxID) == expected.head_tx_id, "\(label) head_tx_id")
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

private func optionalUInt8(_ value: Int?) throws -> UInt8? {
    guard let value else { return nil }
    return try uint8(value)
}

private func optionalHex(_ value: String?) throws -> Data? {
    guard let value else { return nil }
    return try data(hex: value)
}

private func utf8Name(_ value: String?) -> Data? {
    value?.data(using: .utf8)
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
