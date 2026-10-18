@preconcurrency import Crypto
import Foundation

/**
 Public room administration.

 Protocol `0x03` is the room record. `0x06` action 5 delivers the room key and
 cites one accepted administration record. Legacy `0x06` actions 1–4 stay in
 `GroupMailbox`.
 */
public enum GroupAdmin {
    public struct State: Sendable, Equatable {
        public let groupID: Data
        public let mailbox: Data
        public let owner: Data
        public let admins: [Data]
        public let members: [Data]
        public let pending: [Data]
        public let policy: UInt8
        public let name: Data
        public let epoch: UInt32
        public let headTxID: Data

        public init(
            groupID: Data,
            mailbox: Data,
            owner: Data,
            admins: [Data],
            members: [Data],
            pending: [Data],
            policy: UInt8,
            name: Data,
            epoch: UInt32,
            headTxID: Data
        ) {
            self.groupID = groupID
            self.mailbox = mailbox
            self.owner = owner
            self.admins = admins
            self.members = members
            self.pending = pending
            self.policy = policy
            self.name = name
            self.epoch = epoch
            self.headTxID = headTxID
        }
    }

    public struct Event: Sendable, Equatable {
        public let note: Data
        public let sender: Data
        public let txID: Data
        public let round: Int
        public let offset: Int

        public init(note: Data, sender: Data, txID: Data, round: Int, offset: Int) {
            self.note = note
            self.sender = sender
            self.txID = txID
            self.round = round
            self.offset = offset
        }
    }

    public struct Accepted: Sendable, Equatable {
        public let txID: Data
        public let sender: Data
        public let op: UInt8
        public let epoch: UInt32
        public let subject: Data
        public let members: [Data]

        public init(txID: Data, sender: Data, op: UInt8, epoch: UInt32, subject: Data, members: [Data]) {
            self.txID = txID
            self.sender = sender
            self.op = op
            self.epoch = epoch
            self.subject = subject
            self.members = members
        }
    }

    public struct Rejection: Sendable, Equatable {
        public let txID: Data
        public let reason: String

        public init(txID: Data, reason: String) {
            self.txID = txID
            self.reason = reason
        }
    }

    public struct Reduced: Sendable, Equatable {
        public let state: State?
        public let accepted: [Accepted]
        public let rejected: [Rejection]

        public init(state: State?, accepted: [Accepted], rejected: [Rejection]) {
            self.state = state
            self.accepted = accepted
            self.rejected = rejected
        }
    }

    public struct Delivery: Sendable, Equatable {
        public let epoch: UInt32
        public let groupID: Data
        public let mailbox: Data
        public let groupKey: Data
        public let adminTxID: Data

        public init(epoch: UInt32, groupID: Data, mailbox: Data, groupKey: Data, adminTxID: Data) {
            self.epoch = epoch
            self.groupID = groupID
            self.mailbox = mailbox
            self.groupKey = groupKey
            self.adminTxID = adminTxID
        }
    }

    public static let version = GroupMailbox.version
    public static let protocolID: UInt8 = 0x03
    public static let deliverAction: UInt8 = 5
    public static let nameMax = 64
    public static let adminMax = 16
    public static let memberMax = 100
    public static let deliverPlaintextSize = 133
    public static let joiningInvite: UInt8 = 1
    public static let joiningAsk: UInt8 = 2
    public static let deliveryNoteSize = GroupMailbox.membershipHeaderSize + deliverPlaintextSize + GroupMailbox.tagSize

    /// Drafts the one legal next record. Pending joins are not written in the note.
    public static func draft(
        state: State?,
        op: UInt8,
        sender: Data,
        subject: Data? = nil,
        name: Data? = nil,
        policy: UInt8? = nil,
        groupID: Data? = nil,
        mailbox: Data? = nil
    ) throws -> Data {
        let chosenSubject = subject ?? Data(count: keySize)
        let parent = state?.headTxID ?? Data(count: keySize)
        let chosenGroupID = groupID ?? state?.groupID ?? Data(count: keySize)
        let chosenMailbox = mailbox ?? state?.mailbox ?? Data(count: keySize)
        let chosenName = name ?? state?.name ?? Data()
        let chosenPolicy = policy ?? state?.policy ?? joiningInvite
        let owner = state?.owner ?? sender
        let next: Body
        if op == Op.create {
            next = Body(
                groupID: chosenGroupID,
                mailbox: chosenMailbox,
                owner: Data(sender),
                admins: [],
                members: [Data(sender)],
                pending: [],
                policy: chosenPolicy,
                name: chosenName,
                epoch: 1
            )
        } else {
            let decoded = Decoded(
                parent: parent,
                groupID: chosenGroupID,
                mailbox: chosenMailbox,
                epoch: state?.epoch ?? 1,
                op: op,
                name: chosenName,
                policy: chosenPolicy,
                owner: owner,
                admins: state?.admins ?? [],
                members: state?.members ?? [],
                subject: chosenSubject
            )
            next = try expectNext(state, decoded, sender)
        }
        return try encode(
            Decoded(
                parent: parent,
                groupID: next.groupID,
                mailbox: next.mailbox,
                epoch: next.epoch,
                op: op,
                name: next.name,
                policy: next.policy,
                owner: next.owner,
                admins: next.admins,
                members: next.members,
                subject: chosenSubject
            )
        )
    }

    /// Sorts by confirmed round, then offset, then transaction id. A repeated id is `replay`.
    public static func reduce(_ events: [Event]) -> Reduced {
        let ordered = events.sorted { lhs, rhs in
            if lhs.round != rhs.round { return lhs.round < rhs.round }
            if lhs.offset != rhs.offset { return lhs.offset < rhs.offset }
            return compareBytes(lhs.txID, rhs.txID) < 0
        }
        var state: State?
        var accepted: [Accepted] = []
        var rejected: [Rejection] = []
        var seen = Set<Data>()
        // 32 zero bytes are create's parent, not an accepted administration id.
        var known = Set<Data>()
        for event in ordered {
            if seen.contains(event.txID) {
                rejected.append(Rejection(txID: Data(event.txID), reason: "replay"))
                continue
            }
            do {
                let next = try apply(state, event, known)
                seen.insert(Data(event.txID))
                if next.advance {
                    known.insert(Data(event.txID))
                }
                state = next.state
                accepted.append(next.accepted)
            } catch let error as RoomFailure {
                rejected.append(Rejection(txID: Data(event.txID), reason: error.message))
            } catch {
                rejected.append(Rejection(txID: Data(event.txID), reason: String(describing: error)))
            }
        }
        return Reduced(state: state, accepted: accepted, rejected: rejected)
    }

    /// True only when `epoch` equals the room epoch and `sender` is a current member.
    public static func senderMayPost(state: State, sender: Data, epoch: UInt32) throws -> Bool {
        try requireCount("sender", sender, keySize)
        return epoch == state.epoch && contains(state.members, sender)
    }

    /// Whether `recipient` may receive the room key for one accepted record.
    public static func deliveryAuthorized(
        accepted: [Accepted],
        adminTxID: Data,
        sender: Data,
        recipient: Data,
        epoch: UInt32
    ) -> Bool {
        guard let record = accepted.first(where: { $0.txID == adminTxID }),
              record.sender == sender,
              record.epoch == epoch,
              contains(record.members, recipient)
        else {
            return false
        }
        if record.op == Op.addMember || record.op == Op.acceptJoin {
            return record.subject == recipient
        }
        if record.op == Op.removeMember {
            return record.subject != recipient
        }
        if record.op == Op.rekey || record.op == Op.transferOwner {
            return true
        }
        return false
    }

    /**
     Seals a 227-byte `0x06` action 5 note.

     The header is the AEAD associated data. Plaintext is 133 bytes: action 5,
     epoch, group id, mailbox, group key, and the administration transaction id.
     */
    public static func sealKeyDelivery(
        sessionKey: Data,
        senderPublicKey: Data,
        handshakeID: Data,
        epoch: UInt32,
        groupID: Data,
        mailbox: Data,
        groupKey: Data,
        adminTxID: Data,
        nonce: Data
    ) throws -> Data {
        try requireCount("session key", sessionKey, keySize)
        try requireCount("sender public key", senderPublicKey, keySize)
        try requireCount("handshake id", handshakeID, keySize)
        try requireCount("nonce", nonce, nonceSize)
        let plaintext = try encodeDelivery(
            epoch: epoch,
            groupID: groupID,
            mailbox: mailbox,
            groupKey: groupKey,
            adminTxID: adminTxID
        )
        let header = deliveryHeader(senderPublicKey: senderPublicKey, handshakeID: handshakeID, nonce: nonce)
        let sealed = try seal(key: SymmetricKey(data: sessionKey), nonce: nonce, aad: header, plaintext: plaintext)
        var note = Data(header)
        note.append(sealed)
        guard note.count == deliveryNoteSize else {
            throw fail("Group key delivery note is \(note.count) bytes")
        }
        return note
    }

    /// Opens a 227-byte `0x06` action 5 note. A 195-byte legacy note does not open here.
    public static func openKeyDelivery(
        note: Data,
        sessionKey: Data,
        senderPublicKey: Data,
        handshakeID: Data
    ) throws -> Delivery {
        try requireCount("session key", sessionKey, keySize)
        try requireCount("sender public key", senderPublicKey, keySize)
        try requireCount("handshake id", handshakeID, keySize)
        let bytes = [UInt8](note)
        guard bytes.count == deliveryNoteSize, bytes[0] == version, bytes[1] == GroupMailbox.membershipID else {
            throw fail("Not a group key delivery")
        }
        let sender = try slice(bytes, 2, keySize)
        let handshake = try slice(bytes, 34, keySize)
        guard sender == senderPublicKey else {
            throw fail("Key delivery sender does not match the session")
        }
        guard handshake == handshakeID else {
            throw fail("Key delivery is for a different handshake")
        }
        let nonce = try slice(bytes, 66, nonceSize)
        let header = Data(bytes[..<GroupMailbox.membershipHeaderSize])
        let sealed = Data(bytes[GroupMailbox.membershipHeaderSize...])
        let plaintext: Data
        do {
            plaintext = try open(key: SymmetricKey(data: sessionKey), nonce: nonce, aad: header, sealed: sealed)
        } catch {
            throw fail("Group key delivery authentication failed")
        }
        guard plaintext.count == deliverPlaintextSize, plaintext.first == deliverAction else {
            throw fail("Group key delivery plaintext is not action 5")
        }
        let plain = [UInt8](plaintext)
        let epoch = try readU32(plain, at: 1)
        guard epoch >= 1 else {
            throw fail("Group epoch must be from 1 through 4294967295")
        }
        return Delivery(
            epoch: epoch,
            groupID: try slice(plain, 5, keySize),
            mailbox: try slice(plain, 37, keySize),
            groupKey: try slice(plain, 69, keySize),
            adminTxID: try slice(plain, 101, keySize)
        )
    }

    // MARK: - Apply

    private struct Decoded {
        var parent: Data
        var groupID: Data
        var mailbox: Data
        var epoch: UInt32
        var op: UInt8
        var name: Data
        var policy: UInt8
        var owner: Data
        var admins: [Data]
        var members: [Data]
        var subject: Data
    }

    private struct Body {
        var groupID: Data
        var mailbox: Data
        var owner: Data
        var admins: [Data]
        var members: [Data]
        var pending: [Data]
        var policy: UInt8
        var name: Data
        var epoch: UInt32
    }

    private struct Applied {
        var state: State
        var accepted: Accepted
        var advance: Bool
    }

    private enum Op {
        static let create: UInt8 = 1
        static let setName: UInt8 = 2
        static let setPolicy: UInt8 = 3
        static let appointAdmin: UInt8 = 4
        static let dismissAdmin: UInt8 = 5
        static let transferOwner: UInt8 = 6
        static let addMember: UInt8 = 7
        static let requestJoin: UInt8 = 8
        static let acceptJoin: UInt8 = 9
        static let declineJoin: UInt8 = 10
        static let removeMember: UInt8 = 11
        static let rekey: UInt8 = 12

        static func known(_ op: UInt8) -> Bool {
            op >= create && op <= rekey
        }
    }

    private static func apply(_ state: State?, _ event: Event, _ known: Set<Data>) throws -> Applied {
        try requireCount("sender", event.sender, keySize)
        try requireCount("transaction id", event.txID, keySize)
        let decoded = try decode(event.note)
        if decoded.mailbox == event.sender {
            throw fail("Mailbox key does not own the room")
        }
        let parent = state?.headTxID ?? Data(count: keySize)
        let request = decoded.op == Op.requestJoin
        if request {
            if state == nil || isZero(decoded.parent) || !known.contains(decoded.parent) {
                throw fail("Join request does not cite this room")
            }
        } else if decoded.parent != parent {
            throw fail("Stale administration parent")
        }
        let next = try expectNext(state, decoded, event.sender)
        if !sameState(decoded, next) {
            throw fail("Administration record does not match the authorized next state")
        }
        let head: Data
        if request {
            guard let state else {
                throw fail("Join request does not cite this room")
            }
            head = Data(state.headTxID)
        } else {
            head = Data(event.txID)
        }
        let room = State(
            groupID: next.groupID,
            mailbox: next.mailbox,
            owner: next.owner,
            admins: next.admins,
            members: next.members,
            pending: next.pending,
            policy: next.policy,
            name: next.name,
            epoch: next.epoch,
            headTxID: head
        )
        return Applied(
            state: room,
            accepted: Accepted(
                txID: Data(event.txID),
                sender: Data(event.sender),
                op: decoded.op,
                epoch: room.epoch,
                subject: Data(decoded.subject),
                members: room.members.map { Data($0) }
            ),
            advance: !request
        )
    }

    private static func expectNext(_ state: State?, _ decoded: Decoded, _ sender: Data) throws -> Body {
        if decoded.op == Op.create {
            if state != nil {
                throw fail("Create requires an empty parent")
            }
            if !isZero(decoded.parent) || !isZero(decoded.subject) {
                throw fail("Create parent and subject must be zero")
            }
            if decoded.owner != sender {
                throw fail("Create sender is not the owner")
            }
            if decoded.epoch != 1 || !decoded.admins.isEmpty {
                throw fail("Create starts at epoch 1 with no admins")
            }
            if decoded.members.count != 1 || decoded.members[0] != sender {
                throw fail("Create membership is the owner alone")
            }
            try rejectMailboxOverlap(decoded.mailbox, decoded.members, decoded.admins, decoded.owner)
            return body(decoded, [])
        }
        guard let state else {
            throw fail("Administration parent is missing")
        }
        if decoded.groupID != state.groupID || decoded.mailbox != state.mailbox {
            throw fail("Administration record is for a different room")
        }
        let privileged = sender == state.owner || contains(state.admins, sender)
        var members = state.members.map { Data($0) }
        var admins = state.admins.map { Data($0) }
        var pending = state.pending.map { Data($0) }
        var owner = Data(state.owner)
        var epoch = state.epoch
        var name = Data(state.name)
        var policy = state.policy
        let subject = decoded.subject
        if decoded.op == Op.setName {
            if !privileged || !isZero(subject) {
                throw fail("Sender cannot rename the room")
            }
            name = Data(decoded.name)
        } else if decoded.op == Op.setPolicy {
            if !privileged || !isZero(subject) {
                throw fail("Sender cannot change the joining rule")
            }
            policy = decoded.policy
        } else if decoded.op == Op.appointAdmin {
            if sender != state.owner {
                throw fail("Only the owner appoints an admin")
            }
            if !contains(members, subject) || subject == owner || contains(admins, subject) {
                throw fail("That person cannot be appointed")
            }
            admins = try canonicalSet(admins + [Data(subject)], label: "admins", max: adminMax)
        } else if decoded.op == Op.dismissAdmin {
            if sender != state.owner || !contains(admins, subject) {
                throw fail("Only the owner dismisses an admin")
            }
            admins = admins.filter { $0 != subject }
        } else if decoded.op == Op.transferOwner {
            if sender != state.owner || !contains(members, subject) || subject == owner {
                throw fail("Ownership can move only from the owner to another member")
            }
            owner = Data(subject)
            admins = admins.filter { $0 != subject }
            epoch = try bump(epoch)
        } else if decoded.op == Op.addMember {
            if !privileged || contains(members, subject) || subject == state.mailbox {
                throw fail("Sender cannot add that member")
            }
            members = try canonicalSet(members + [Data(subject)], label: "members", max: memberMax)
            pending = pending.filter { $0 != subject }
        } else if decoded.op == Op.requestJoin {
            if state.policy != joiningAsk || sender != subject || contains(members, subject) || contains(pending, subject) {
                throw fail("That join request is not allowed")
            }
            pending = try canonicalSet(pending + [Data(subject)], label: "pending", max: memberMax)
        } else if decoded.op == Op.acceptJoin {
            if !privileged || !contains(pending, subject) {
                throw fail("No join request to accept")
            }
            members = try canonicalSet(members + [Data(subject)], label: "members", max: memberMax)
            pending = pending.filter { $0 != subject }
        } else if decoded.op == Op.declineJoin {
            if !privileged || !contains(pending, subject) {
                throw fail("No join request to decline")
            }
            pending = pending.filter { $0 != subject }
        } else if decoded.op == Op.removeMember {
            if !privileged || !contains(members, subject) || subject == owner {
                throw fail("Sender cannot remove that member")
            }
            members = members.filter { $0 != subject }
            admins = admins.filter { $0 != subject }
            pending = pending.filter { $0 != subject }
            epoch = try bump(epoch)
        } else if decoded.op == Op.rekey {
            if !privileged || !isZero(subject) {
                throw fail("Sender cannot rotate the room key")
            }
            epoch = try bump(epoch)
        } else {
            throw fail("Unknown room administration operation")
        }
        try rejectMailboxOverlap(state.mailbox, members, admins, owner)
        if !contains(members, owner) {
            throw fail("The owner must remain a member")
        }
        return Body(
            groupID: Data(state.groupID),
            mailbox: Data(state.mailbox),
            owner: owner,
            admins: admins,
            members: members,
            pending: pending,
            policy: policy,
            name: name,
            epoch: epoch
        )
    }

    private static func body(_ decoded: Decoded, _ pending: [Data]) -> Body {
        Body(
            groupID: Data(decoded.groupID),
            mailbox: Data(decoded.mailbox),
            owner: Data(decoded.owner),
            admins: decoded.admins.map { Data($0) },
            members: decoded.members.map { Data($0) },
            pending: pending,
            policy: decoded.policy,
            name: Data(decoded.name),
            epoch: decoded.epoch
        )
    }

    private static func sameState(_ decoded: Decoded, _ next: Body) -> Bool {
        decoded.owner == next.owner
            && decoded.epoch == next.epoch
            && decoded.policy == next.policy
            && decoded.name == next.name
            && sameSet(decoded.admins, next.admins)
            && sameSet(decoded.members, next.members)
    }

    private static func rejectMailboxOverlap(_ mailbox: Data, _ members: [Data], _ admins: [Data], _ owner: Data) throws {
        if mailbox == owner || contains(members, mailbox) || contains(admins, mailbox) {
            throw fail("Mailbox key does not own the room")
        }
    }

    // MARK: - Codec

    private static func encode(_ fields: Decoded) throws -> Data {
        let name = try canonicalName(fields.name)
        let admins = try canonicalSet(fields.admins, label: "admins", max: adminMax)
        let members = try canonicalSet(fields.members, label: "members", max: memberMax)
        try requireCount("parent", fields.parent, keySize)
        try requireCount("group id", fields.groupID, keySize)
        try requireCount("mailbox", fields.mailbox, keySize)
        try requireCount("owner", fields.owner, keySize)
        try requireCount("subject", fields.subject, keySize)
        if fields.policy != joiningInvite && fields.policy != joiningAsk {
            throw fail("Joining rule must be invite-only or ask-to-join")
        }
        if !Op.known(fields.op) {
            throw fail("Unknown room administration operation")
        }
        var out = Data()
        out.reserveCapacity(173 + name.count + (admins.count + members.count) * keySize)
        out.append(version)
        out.append(protocolID)
        out.append(fields.parent)
        out.append(fields.groupID)
        out.append(fields.mailbox)
        out.append(bigEndian(fields.epoch))
        out.append(fields.op)
        out.append(UInt8(name.count))
        out.append(name)
        out.append(fields.policy)
        out.append(fields.owner)
        appendU16(&out, admins.count)
        for admin in admins {
            out.append(admin)
        }
        appendU16(&out, members.count)
        for member in members {
            out.append(member)
        }
        out.append(fields.subject)
        if out.count > ChatEnvelope.maxNoteSize {
            throw fail("Administration record exceeds 4096 bytes")
        }
        return out
    }

    private static func decode(_ note: Data) throws -> Decoded {
        let bytes = [UInt8](note)
        guard bytes.count >= minimumRecordSize, bytes[0] == version, bytes[1] == protocolID else {
            throw fail("Not a room administration record")
        }
        var cursor = 2
        let parent = try take(bytes, &cursor, keySize)
        let groupID = try take(bytes, &cursor, keySize)
        let mailbox = try take(bytes, &cursor, keySize)
        let epoch = try readU32(bytes, &cursor)
        let op = try take(bytes, &cursor, 1)[0]
        let nameLen = Int(try take(bytes, &cursor, 1)[0])
        if nameLen > nameMax {
            throw fail("Room name is longer than 64 bytes")
        }
        let name = try take(bytes, &cursor, nameLen)
        _ = try canonicalName(name)
        let policy = try take(bytes, &cursor, 1)[0]
        let owner = try take(bytes, &cursor, keySize)
        let adminCount = Int(try readU16(bytes, &cursor))
        var admins: [Data] = []
        admins.reserveCapacity(adminCount)
        for _ in 0..<adminCount {
            admins.append(try take(bytes, &cursor, keySize))
        }
        let memberCount = Int(try readU16(bytes, &cursor))
        var members: [Data] = []
        members.reserveCapacity(memberCount)
        for _ in 0..<memberCount {
            members.append(try take(bytes, &cursor, keySize))
        }
        let subject = try take(bytes, &cursor, keySize)
        if cursor != bytes.count {
            throw fail("Administration record has trailing bytes")
        }
        _ = try canonicalSet(admins, label: "admins", max: adminMax)
        _ = try canonicalSet(members, label: "members", max: memberMax)
        if !strictlyIncreasing(admins) || !strictlyIncreasing(members) {
            throw fail("Administration sets must be strictly sorted")
        }
        if policy != joiningInvite && policy != joiningAsk {
            throw fail("Joining rule must be invite-only or ask-to-join")
        }
        return Decoded(
            parent: parent,
            groupID: groupID,
            mailbox: mailbox,
            epoch: epoch,
            op: op,
            name: name,
            policy: policy,
            owner: owner,
            admins: admins,
            members: members,
            subject: subject
        )
    }

    private static func encodeDelivery(
        epoch: UInt32,
        groupID: Data,
        mailbox: Data,
        groupKey: Data,
        adminTxID: Data
    ) throws -> Data {
        if epoch < 1 {
            throw fail("Group epoch must be from 1 through 4294967295")
        }
        try requireCount("group id", groupID, keySize)
        try requireCount("mailbox", mailbox, keySize)
        try requireCount("group key", groupKey, keySize)
        try requireCount("administration id", adminTxID, keySize)
        var out = Data()
        out.reserveCapacity(deliverPlaintextSize)
        out.append(deliverAction)
        out.append(bigEndian(epoch))
        out.append(groupID)
        out.append(mailbox)
        out.append(groupKey)
        out.append(adminTxID)
        guard out.count == deliverPlaintextSize else {
            throw fail("Group key delivery plaintext is not action 5")
        }
        return out
    }

    private static func deliveryHeader(senderPublicKey: Data, handshakeID: Data, nonce: Data) -> Data {
        var header = Data()
        header.reserveCapacity(GroupMailbox.membershipHeaderSize)
        header.append(version)
        header.append(GroupMailbox.membershipID)
        header.append(senderPublicKey)
        header.append(handshakeID)
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
        guard sealed.count >= GroupMailbox.tagSize else {
            throw fail("Group key delivery authentication failed")
        }
        let split = sealed.count - GroupMailbox.tagSize
        let box = try ChaChaPoly.SealedBox(
            nonce: try ChaChaPoly.Nonce(data: nonce),
            ciphertext: sealed.prefix(split),
            tag: sealed.suffix(GroupMailbox.tagSize)
        )
        return try ChaChaPoly.open(box, using: key, authenticating: aad)
    }

    // MARK: - Bytes

    private static let keySize = 32
    private static let nonceSize = 12
    private static let minimumRecordSize = 141

    private static func canonicalName(_ name: Data) throws -> Data {
        if name.count > nameMax {
            throw fail("Room name is longer than 64 bytes")
        }
        guard String(data: name, encoding: .utf8) != nil else {
            throw fail("Room name is not UTF-8")
        }
        return name
    }

    private static func canonicalSet(_ values: [Data], label: String, max: Int) throws -> [Data] {
        let sorted = values.map { Data($0) }.sorted { compareBytes($0, $1) < 0 }
        if sorted.count > 1 {
            for index in 1..<sorted.count where sorted[index] == sorted[index - 1] {
                throw fail("Duplicate \(label)")
            }
        }
        if sorted.count > max {
            throw fail("Too many \(label)")
        }
        for value in sorted {
            try requireCount(label, value, keySize)
        }
        return sorted
    }

    private static func strictlyIncreasing(_ values: [Data]) -> Bool {
        if values.count < 2 {
            return true
        }
        for index in 1..<values.count where compareBytes(values[index - 1], values[index]) >= 0 {
            return false
        }
        return true
    }

    private static func contains(_ values: [Data], _ target: Data) -> Bool {
        values.contains(target)
    }

    private static func sameSet(_ left: [Data], _ right: [Data]) -> Bool {
        left.count == right.count && zip(left, right).allSatisfy { $0 == $1 }
    }

    private static func compareBytes(_ left: Data, _ right: Data) -> Int {
        let count = min(left.count, right.count)
        if count > 0 {
            for index in 0..<count where left[index] != right[index] {
                return Int(left[index]) - Int(right[index])
            }
        }
        return left.count - right.count
    }

    private static func bump(_ epoch: UInt32) throws -> UInt32 {
        if epoch == UInt32.max {
            throw fail("Group epoch is exhausted")
        }
        return epoch + 1
    }

    private static func isZero(_ value: Data) -> Bool {
        value.allSatisfy { $0 == 0 }
    }

    private static func requireCount(_ name: String, _ value: Data, _ count: Int) throws {
        guard value.count == count else {
            throw fail("\(name) must be \(count) bytes, got \(value.count)")
        }
    }

    private static func appendU16(_ out: inout Data, _ value: Int) {
        out.append(UInt8((value >> 8) & 0xff))
        out.append(UInt8(value & 0xff))
    }

    private static func bigEndian(_ value: UInt32) -> Data {
        Data([
            UInt8(truncatingIfNeeded: value >> 24),
            UInt8(truncatingIfNeeded: value >> 16),
            UInt8(truncatingIfNeeded: value >> 8),
            UInt8(truncatingIfNeeded: value),
        ])
    }

    private static func readU32(_ bytes: [UInt8], _ cursor: inout Int) throws -> UInt32 {
        let raw = [UInt8](try take(bytes, &cursor, 4))
        return UInt32(raw[0]) << 24
            | UInt32(raw[1]) << 16
            | UInt32(raw[2]) << 8
            | UInt32(raw[3])
    }

    private static func readU32(_ bytes: [UInt8], at offset: Int) throws -> UInt32 {
        guard offset >= 0, bytes.count >= 4, offset <= bytes.count - 4 else {
            throw fail("Administration record is truncated")
        }
        return UInt32(bytes[offset]) << 24
            | UInt32(bytes[offset + 1]) << 16
            | UInt32(bytes[offset + 2]) << 8
            | UInt32(bytes[offset + 3])
    }

    private static func readU16(_ bytes: [UInt8], _ cursor: inout Int) throws -> UInt16 {
        let raw = [UInt8](try take(bytes, &cursor, 2))
        return UInt16(raw[0]) << 8 | UInt16(raw[1])
    }

    private static func take(_ bytes: [UInt8], _ cursor: inout Int, _ count: Int) throws -> Data {
        guard count >= 0, cursor >= 0, cursor <= bytes.count, count <= bytes.count - cursor else {
            throw fail("Administration record is truncated")
        }
        let slice = Data(bytes[cursor..<(cursor + count)])
        cursor += count
        return slice
    }

    private static func slice(_ bytes: [UInt8], _ start: Int, _ count: Int) throws -> Data {
        guard start >= 0, count >= 0, bytes.count >= count, start <= bytes.count - count else {
            throw fail("Administration record is truncated")
        }
        return Data(bytes[start..<(start + count)])
    }

    private static func fail(_ message: String) -> RoomFailure {
        RoomFailure(message: message)
    }
}

private struct RoomFailure: Error, Sendable, CustomStringConvertible, LocalizedError {
    let message: String

    var description: String { message }

    var errorDescription: String? { message }
}
