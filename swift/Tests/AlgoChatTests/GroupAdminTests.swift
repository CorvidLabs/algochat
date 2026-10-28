import Crypto
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
            let stored = [UInt8](try data(hex: draft.note))
            #expect(stored[0] == GroupAdmin.version)
            #expect(stored[1] == GroupAdmin.protocolID)
            let nameLen = Int(stored[103])
            let adminCount = (Int(stored[137 + nameLen]) << 8) | Int(stored[138 + nameLen])
            let memberAt = 139 + nameLen + (32 * adminCount)
            let memberCount = (Int(stored[memberAt]) << 8) | Int(stored[memberAt + 1])
            #expect(memberCount != GroupAdmin.membersOmitted)
            #expect(memberCount <= 100)
            let delta = try GroupAdmin.draft(
                state: try roomState(draft.basis_state),
                op: try uint8(draft.op),
                sender: try data(hex: draft.sender),
                subject: try data(hex: draft.subject),
                name: utf8Name(draft.name_utf8),
                policy: try optionalUInt8(draft.policy),
                groupID: try optionalHex(draft.group_id),
                mailbox: try optionalHex(draft.mailbox),
                parentRoom: try roomState(draft.parent_room)
            )
            #expect(delta.count <= 4096, "draft \(draft.name)")
            let deltaBytes = [UInt8](delta)
            let deltaName = Int(deltaBytes[103])
            let deltaAdmins = (Int(deltaBytes[137 + deltaName]) << 8) | Int(deltaBytes[138 + deltaName])
            let deltaAt = 139 + deltaName + (32 * deltaAdmins)
            let deltaCount = (Int(deltaBytes[deltaAt]) << 8) | Int(deltaBytes[deltaAt + 1])
            #expect(deltaCount == GroupAdmin.membersOmitted, "draft \(draft.name)")
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

    @Test("action 5 binds version, the supplied session, and a positive epoch")
    func bindsDelivery() throws {
        let key = Data((0..<32).map { _ in UInt8.random(in: 0...255) })
        let sender = fill(0x11)
        let handshake = fill(0x43)
        let nonce = Data((0..<12).map { _ in UInt8.random(in: 0...255) })
        let groupID = fill(7)
        let mailbox = fill(9)
        let note = try GroupAdmin.sealKeyDelivery(
            sessionKey: key,
            senderPublicKey: sender,
            handshakeID: handshake,
            epoch: 1,
            groupID: groupID,
            mailbox: mailbox,
            groupKey: fill(4),
            adminTxID: fill(10),
            nonce: nonce
        )
        let opened = try GroupAdmin.openKeyDelivery(note: note, sessionKey: key, senderPublicKey: sender, handshakeID: handshake)
        #expect(opened.epoch == 1)
        try expectDescription("sender") {
            _ = try GroupAdmin.openKeyDelivery(note: note, sessionKey: key, senderPublicKey: fill(0x22), handshakeID: handshake)
        }
        try expectDescription("handshake") {
            _ = try GroupAdmin.openKeyDelivery(note: note, sessionKey: key, senderPublicKey: sender, handshakeID: fill(0x44))
        }
        var flipped = note
        flipped[flipped.count - 1] ^= 1
        try expectDescription("authentication") {
            _ = try GroupAdmin.openKeyDelivery(note: flipped, sessionKey: key, senderPublicKey: sender, handshakeID: handshake)
        }
        var plain = Data(count: 133)
        plain[0] = 5
        plain.replaceSubrange(5..<37, with: groupID)
        plain.replaceSubrange(37..<69, with: mailbox)
        plain.replaceSubrange(69..<101, with: fill(4))
        plain.replaceSubrange(101..<133, with: fill(10))
        for version in [UInt8(0), 1, 3, 255] {
            let bad = try sealRaw(sessionKey: key, sender: sender, handshake: handshake, plaintext: plain, version: version, nonce: nonce)
            try expectDescription("Not a group key delivery") {
                _ = try GroupAdmin.openKeyDelivery(note: bad, sessionKey: key, senderPublicKey: sender, handshakeID: handshake)
            }
        }
        let epochZero = try sealRaw(sessionKey: key, sender: sender, handshake: handshake, plaintext: plain, version: GroupAdmin.version, nonce: nonce)
        try expectDescription("epoch") {
            _ = try GroupAdmin.openKeyDelivery(note: epochZero, sessionKey: key, senderPublicKey: sender, handshakeID: handshake)
        }
    }

    @Test("undefined joining policies are rejected and leave the room unchanged")
    func rejectsUndefinedPolicy() throws {
        let owner = fill(1)
        let groupID = fill(7)
        let mailbox = fill(9)
        let create = try GroupAdmin.draft(
            state: nil,
            op: 1,
            sender: owner,
            name: Data("team".utf8),
            policy: 1,
            groupID: groupID,
            mailbox: mailbox
        )
        for policy in [UInt8(0), 3, 255] {
            let reduced = GroupAdmin.reduce([
                GroupAdmin.Event(note: withPolicy(create, policy), sender: owner, txID: fill(10), round: 1, offset: 0)
            ])
            #expect(reduced.state == nil)
            #expect(reduced.accepted.isEmpty)
            #expect(reduced.rejected[0].reason.contains("invite-only or ask-to-join"))
        }
        let created = GroupAdmin.reduce([
            GroupAdmin.Event(note: create, sender: owner, txID: fill(10), round: 1, offset: 0)
        ])
        let state = try #require(created.state)
        let setPolicy = try GroupAdmin.draft(state: state, op: 3, sender: owner, policy: 2)
        for policy in [UInt8(0), 3, 255] {
            let reduced = GroupAdmin.reduce([
                GroupAdmin.Event(note: create, sender: owner, txID: fill(10), round: 1, offset: 0),
                GroupAdmin.Event(note: withPolicy(setPolicy, policy), sender: owner, txID: fill(11), round: 1, offset: 1),
            ])
            #expect(reduced.state?.policy == 1)
            #expect(reduced.state?.headTxID == fill(10))
            #expect(reduced.rejected.count == 1)
            #expect(reduced.rejected[0].reason.contains("invite-only or ask-to-join"))
        }
    }

    @Test("a join request must cite an accepted administration transaction")
    func rejectsZeroJoinParent() throws {
        let owner = fill(1)
        let friend = fill(2)
        let groupID = fill(7)
        let mailbox = fill(9)
        let create = try GroupAdmin.draft(
            state: nil,
            op: 1,
            sender: owner,
            name: Data("general".utf8),
            policy: 2,
            groupID: groupID,
            mailbox: mailbox
        )
        let created = GroupAdmin.reduce([
            GroupAdmin.Event(note: create, sender: owner, txID: fill(10), round: 1, offset: 0)
        ])
        let state = try #require(created.state)
        let real = try GroupAdmin.draft(state: state, op: 8, sender: friend, subject: friend)
        var zero = real
        zero.replaceSubrange(2..<34, with: Data(count: 32))
        var unknown = real
        unknown.replaceSubrange(2..<34, with: Data(repeating: 0x99, count: 32))
        let base = GroupAdmin.Event(note: create, sender: owner, txID: fill(10), round: 1, offset: 0)
        let zeroed = GroupAdmin.reduce([base, GroupAdmin.Event(note: zero, sender: friend, txID: fill(11), round: 1, offset: 1)])
        #expect(zeroed.state?.pending.isEmpty == true)
        #expect(zeroed.state?.headTxID == fill(10))
        #expect(zeroed.rejected[0].reason.contains("cite"))
        let missed = GroupAdmin.reduce([base, GroupAdmin.Event(note: unknown, sender: friend, txID: fill(11), round: 1, offset: 1)])
        #expect(missed.state?.pending.isEmpty == true)
        #expect(missed.state?.policy == 2)
        #expect(missed.rejected[0].reason.contains("cite"))
        let accepted = GroupAdmin.reduce([base, GroupAdmin.Event(note: real, sender: friend, txID: fill(11), round: 1, offset: 1)])
        #expect(accepted.rejected.isEmpty)
        #expect(accepted.state?.pending == [friend])
        #expect(accepted.state?.headTxID == fill(10))
    }

    @Test("a full-list note of 256 members is too large, and a delta note folds through 256")
    func foldsDeltaThrough256() throws {
        let roster = (1...256).map { person($0) }
        let admins = (0..<GroupAdmin.adminMax).map { person(1000 + $0) }
        let owner = fill(1)
        let friend = fill(2)
        let groupID = fill(7)
        let mailbox = fill(9)
        #expect(GroupAdmin.memberMax == 256)
        #expect(GroupAdmin.nameMax == 64)
        #expect(GroupAdmin.adminMax == 16)
        try expectDescription("too large") {
            _ = try GroupAdmin.encodeRecord(
                parent: Data(count: 32),
                groupID: groupID,
                mailbox: mailbox,
                epoch: 1,
                op: 1,
                name: Data(count: GroupAdmin.nameMax),
                policy: GroupAdmin.joiningInvite,
                owner: roster[0],
                admins: admins,
                members: roster,
                subject: Data(count: 32),
                membersOmitted: false
            )
        }

        let legacy = try GroupAdmin.encodeRecord(
            parent: Data(count: 32),
            groupID: groupID,
            mailbox: mailbox,
            epoch: 1,
            op: 1,
            name: Data("team".utf8),
            policy: GroupAdmin.joiningInvite,
            owner: owner,
            admins: [],
            members: [owner],
            subject: Data(count: 32),
            membersOmitted: false
        )
        let legacyRoom = GroupAdmin.reduce([
            GroupAdmin.Event(note: legacy, sender: owner, txID: fill(10), round: 1, offset: 0)
        ])
        #expect(legacyRoom.rejected.isEmpty)
        #expect(legacyRoom.state?.members.count == 1)
        let legacyAdd = try GroupAdmin.draft(state: legacyRoom.state, op: 7, sender: owner, subject: friend)
        let legacyGrown = GroupAdmin.reduce([
            GroupAdmin.Event(note: legacy, sender: owner, txID: fill(10), round: 1, offset: 0),
            GroupAdmin.Event(note: legacyAdd, sender: owner, txID: fill(11), round: 1, offset: 1),
        ])
        #expect(legacyGrown.rejected.isEmpty)
        #expect(legacyGrown.state?.members.count == 2)

        let hallOwner = person(1)
        var events: [GroupAdmin.Event] = []
        let createdNote = try GroupAdmin.draft(
            state: nil,
            op: 1,
            sender: hallOwner,
            name: Data("hall".utf8),
            policy: GroupAdmin.joiningInvite,
            groupID: person(900),
            mailbox: person(901)
        )
        events.append(marked(createdNote, hallOwner, 1))
        var reduced = GroupAdmin.reduce(events)
        #expect(reduced.rejected.isEmpty)
        #expect(reduced.state?.members.count == 1)
        for count in 2...256 {
            let note = try GroupAdmin.draft(state: reduced.state, op: 7, sender: hallOwner, subject: person(count))
            #expect(note.count <= 4096)
            let bytes = [UInt8](note)
            let nameLen = Int(bytes[103])
            let adminCount = (Int(bytes[137 + nameLen]) << 8) | Int(bytes[138 + nameLen])
            let at = 139 + nameLen + (32 * adminCount)
            let memberCount = (Int(bytes[at]) << 8) | Int(bytes[at + 1])
            #expect(memberCount == GroupAdmin.membersOmitted)
            events.append(marked(note, hallOwner, count))
            reduced = GroupAdmin.reduce(events)
            #expect(reduced.rejected.isEmpty)
            if count == 101 {
                #expect(reduced.state?.members.count == 101)
            }
        }
        #expect(reduced.state?.members.count == 256)
        #expect(reduced.state?.epoch == 1)
    }

    @Test("a channel keeps its own roster, and a missed key payment can resume")
    func channelKeepsItsOwnRoster() throws {
        let owner = fill(1)
        let parentID = person(700)
        let parentMail = person(701)
        let channelID = person(702)
        let channelMail = person(703)
        let alice = person(2)
        let bob = person(3)
        let cara = person(4)
        let extra = (0..<16).map { person(20 + $0) }
        let parentCreate = try GroupAdmin.draft(
            state: nil,
            op: 1,
            sender: owner,
            name: Data("hall".utf8),
            policy: GroupAdmin.joiningInvite,
            groupID: parentID,
            mailbox: parentMail
        )
        var parentEvents = [GroupAdmin.Event(note: parentCreate, sender: owner, txID: fill(10), round: 1, offset: 0)]
        var parent = GroupAdmin.reduce(parentEvents)
        for (index, member) in ([alice, bob, cara] + extra).enumerated() {
            let note = try GroupAdmin.draft(state: parent.state, op: 7, sender: owner, subject: member)
            parentEvents.append(
                GroupAdmin.Event(note: note, sender: owner, txID: fill(UInt8(11 + index)), round: index + 2, offset: 0)
            )
            parent = GroupAdmin.reduce(parentEvents)
        }
        #expect(parent.rejected.isEmpty)
        #expect(parent.state?.members.count == 1 + 3 + extra.count)

        let parentState = try #require(parent.state)
        try expectDescription("group owner") {
            _ = try GroupAdmin.draft(
                state: nil,
                op: 1,
                sender: alice,
                name: Data("ops".utf8),
                policy: GroupAdmin.joiningInvite,
                groupID: channelID,
                mailbox: channelMail,
                parentRoom: parentState
            )
        }

        let channelCreate = try GroupAdmin.draft(
            state: nil,
            op: 1,
            sender: owner,
            name: Data("ops".utf8),
            policy: GroupAdmin.joiningInvite,
            groupID: channelID,
            mailbox: channelMail,
            parentRoom: parentState
        )
        var channelEvents = [GroupAdmin.Event(note: channelCreate, sender: owner, txID: fill(80), round: 30, offset: 0)]
        var channel = GroupAdmin.reduce(channelEvents, parentEvents: parentEvents)
        #expect(channel.rejected.isEmpty)
        #expect(channel.state?.members.count == 1)
        #expect(channel.state?.parentGroupID == parentID)
        #expect(channel.state?.groupID == channelID)
        #expect(channel.state?.mailbox == channelMail)
        #expect(channel.state?.groupID != parent.state?.groupID)

        for (index, member) in ([alice, bob] + extra).enumerated() {
            let note = try GroupAdmin.draft(
                state: channel.state,
                op: 7,
                sender: owner,
                subject: member,
                parentRoom: parent.state
            )
            channelEvents.append(
                GroupAdmin.Event(
                    note: note,
                    sender: owner,
                    txID: fill(UInt8(81 + index)),
                    round: 31 + index,
                    offset: 0
                )
            )
            channel = GroupAdmin.reduce(channelEvents, parentEvents: parentEvents)
        }
        #expect(channel.rejected.isEmpty)
        #expect(channel.state?.members.contains(cara) == false)
        #expect(channel.state?.members.contains(alice) == true)
        try expectDescription("parent room") {
            _ = try GroupAdmin.draft(
                state: channel.state,
                op: 7,
                sender: owner,
                subject: person(500),
                parentRoom: parent.state
            )
        }
        try expectDescription("group owner keeps") {
            _ = try GroupAdmin.draft(
                state: channel.state,
                op: 6,
                sender: owner,
                subject: bob,
                parentRoom: parent.state
            )
        }

        let parentRemove = try GroupAdmin.draft(state: parent.state, op: 11, sender: owner, subject: alice)
        parentEvents.append(
            GroupAdmin.Event(note: parentRemove, sender: owner, txID: fill(60), round: 80, offset: 0)
        )
        parent = GroupAdmin.reduce(parentEvents)
        let removedParent = try #require(parent.state)
        #expect(removedParent.epoch == 2)
        #expect(try GroupAdmin.senderMayPost(state: removedParent, sender: alice, epoch: 2) == false)
        let stale = GroupAdmin.reduce(channelEvents, parentEvents: parentEvents)
        let staleState = try #require(stale.state)
        #expect(staleState.members.contains(alice))
        let departures = try GroupAdmin.channelDepartures(channel: staleState, parent: removedParent)
        #expect(departures.map { $0[3] } == [alice[3]])

        let channelRemove = try GroupAdmin.draft(
            state: stale.state,
            op: 11,
            sender: owner,
            subject: alice,
            parentRoom: parent.state
        )
        channelEvents.append(
            GroupAdmin.Event(note: channelRemove, sender: owner, txID: fill(120), round: 90, offset: 0)
        )
        channel = GroupAdmin.reduce(channelEvents, parentEvents: parentEvents)
        #expect(channel.rejected.isEmpty)
        #expect(channel.state?.epoch == 2)
        #expect(channel.state?.members.contains(alice) == false)
        let removeTx = try #require(channel.accepted.last)
        #expect(GroupAdmin.deliveryAuthorized(
            accepted: channel.accepted,
            adminTxID: removeTx.txID,
            sender: owner,
            recipient: alice,
            epoch: 2
        ) == false)
        #expect(GroupAdmin.deliveryAuthorized(
            accepted: channel.accepted,
            adminTxID: removeTx.txID,
            sender: bob,
            recipient: bob,
            epoch: 2
        ) == false)
        let recipients = GroupAdmin.authorizedRecipients(
            accepted: channel.accepted,
            adminTxID: removeTx.txID,
            sender: owner,
            epoch: 2
        )
        #expect(recipients.contains(alice) == false)
        #expect(recipients.contains(bob))
        #expect(recipients.count > GroupAdmin.deliverBatch)
        let batch = try GroupAdmin.nextDeliveryBatch(recipients)
        #expect(batch.count == GroupAdmin.deliverBatch)
        let missed = batch[batch.count - 1]
        let landed = Array(batch.dropLast())
        let pending = GroupAdmin.pendingKeyDeliveries(recipients, landed: landed)
        #expect(pending.contains(missed))
        #expect(try GroupAdmin.nextDeliveryBatch(pending).first == missed)
        let resumed = landed + [missed]
        let after = GroupAdmin.pendingKeyDeliveries(recipients, landed: resumed)
        #expect(after.contains(missed) == false)
        #expect(after.count == recipients.count - resumed.count)
    }

    @Test("matches vectors/group-admin-delta-v1.json")
    func matchesDeltaVector() throws {
        let vector = try loadAdminVector("group-admin-delta-v1.json")
        #expect(vector.constants.member_max == GroupAdmin.memberMax)
        #expect(vector.constants.members_omitted == GroupAdmin.membersOmitted)
        #expect(vector.constants.deliver_batch == GroupAdmin.deliverBatch)
        for draft in vector.drafts {
            let note = try GroupAdmin.draft(
                state: try roomState(draft.basis_state),
                op: try uint8(draft.op),
                sender: try data(hex: draft.sender),
                subject: try data(hex: draft.subject),
                name: utf8Name(draft.name_utf8),
                policy: try optionalUInt8(draft.policy),
                groupID: try optionalHex(draft.group_id),
                mailbox: try optionalHex(draft.mailbox),
                parentRoom: try roomState(draft.parent_room)
            )
            #expect(hex(note) == draft.note, "draft \(draft.name)")
        }
        for (name, reduction) in vector.reductions {
            let result = GroupAdmin.reduce(
                try events(reduction.events),
                parentEvents: try optionalEvents(reduction.parent_events)
            )
            #expect(result.rejected.map(\.reason) == reduction.rejected.map(\.reason), "\(name) reasons")
            #expect(result.accepted.map { Int($0.op) } == reduction.accepted.map(\.op), "\(name) ops")
            try expectState(result.state, reduction.state, name)
        }
    }
}

private struct AdminVector: Decodable {
    let constants: AdminConstants
    let drafts: [DraftVector]
    let draft_errors: [DraftErrorVector]
    let reductions: [String: ReductionVector]
    let checks: ChecksVector
    let delivery: DeliveryVector
}

private struct AdminConstants: Decodable {
    let member_max: Int
    let members_omitted: Int?
    let deliver_batch: Int?
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
    let parent_room: BasisState?
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
    let parent_group_id: String?
}

private struct ReductionVector: Decodable {
    let parent_events: [EventVector]?
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

private func loadAdminVector(_ name: String = "group-admin-v1.json") throws -> AdminVector {
    let url = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent("vectors/\(name)")
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
        headTxID: try data(hex: basis.head_tx_id),
        parentGroupID: try parentGroup(basis.parent_group_id)
    )
}

private func parentGroup(_ hexID: String?) throws -> Data {
    guard let hexID else { return Data(count: 32) }
    return try data(hex: hexID)
}

private func optionalEvents(_ items: [EventVector]?) throws -> [GroupAdmin.Event]? {
    guard let items else { return nil }
    return try events(items)
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
    if let parent = expected.parent_group_id {
        #expect(hex(state.parentGroupID) == parent, "\(label) parent_group_id")
    }
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

private func fill(_ byte: UInt8) -> Data {
    Data(repeating: byte, count: 32)
}

private func person(_ id: Int) -> Data {
    var out = Data(count: 32)
    out[0] = UInt8((id >> 24) & 0xff)
    out[1] = UInt8((id >> 16) & 0xff)
    out[2] = UInt8((id >> 8) & 0xff)
    out[3] = UInt8(id & 0xff)
    return out
}

private func marked(_ note: Data, _ sender: Data, _ n: Int) -> GroupAdmin.Event {
    GroupAdmin.Event(note: note, sender: sender, txID: person(10_000 + n), round: n, offset: 0)
}

private func withPolicy(_ note: Data, _ policy: UInt8) -> Data {
    var out = note
    let nameLen = Int(out[103])
    out[104 + nameLen] = policy
    return out
}

private func sealRaw(
    sessionKey: Data,
    sender: Data,
    handshake: Data,
    plaintext: Data,
    version: UInt8,
    nonce: Data
) throws -> Data {
    var header = Data([version, GroupMailbox.membershipID])
    header.append(sender)
    header.append(handshake)
    header.append(nonce)
    let box = try ChaChaPoly.seal(
        plaintext,
        using: SymmetricKey(data: sessionKey),
        nonce: try ChaChaPoly.Nonce(data: nonce),
        authenticating: header
    )
    header.append(box.ciphertext)
    header.append(box.tag)
    return header
}
