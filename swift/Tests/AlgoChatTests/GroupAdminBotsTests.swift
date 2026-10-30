import Foundation
import Testing
@testable import AlgoChat

/// Room bots, ops 13 and 14. vectors/group-admin-bots-v1.json is shared by all six libraries.
@Suite("GroupAdmin bots")
struct GroupAdminBotsTests {
    @Test("constants match the bots vector")
    func constants() throws {
        let vector = try loadBotsVector()
        let want: [String: Int] = [
            "op_add_bot": Int(GroupAdmin.opAddBot),
            "op_set_bot": Int(GroupAdmin.opSetBot),
            "mode_mentions": Int(GroupAdmin.botModeMentions),
            "mode_every_message": Int(GroupAdmin.botModeEveryMessage),
            "mode_commands": Int(GroupAdmin.botModeCommands),
            "settings_size": GroupAdmin.botSettingsSize,
            "preset_replies": Int(GroupAdmin.botRatePresetReplies),
            "preset_seconds": Int(GroupAdmin.botRatePresetSeconds),
        ]
        #expect(vector.constants == want)
    }

    @Test("drafts match byte for byte and bad drafts fail with the shared sentence")
    func drafts() throws {
        let vector = try loadBotsVector()
        for item in vector.drafts {
            let note = try botDraft(item)
            #expect(hexString(note) == item.note, "\(item.name)")
        }
        for item in vector.draft_errors {
            if item.wide_integer == true {
                // BotSettings takes UInt16, so a value above 65535 cannot reach the draft at all.
                let bot = try #require(item.bot, "\(item.name)")
                #expect(UInt16(exactly: bot.replies) == nil || UInt16(exactly: bot.seconds) == nil, "\(item.name)")
                continue
            }
            do {
                _ = try botDraft(item)
                Issue.record("\(item.name) drafted")
            } catch {
                let text = String(describing: error).lowercased()
                #expect(text.contains((item.error_includes ?? "").lowercased()), "\(item.name): \(text)")
            }
        }
    }

    @Test("reductions agree on reasons, ops and state")
    func reductions() throws {
        let vector = try loadBotsVector()
        for (name, item) in vector.reductions {
            let got = try botReduce(vector, name)
            #expect(got.rejected.map { hexString($0.txID) } == item.rejected.map(\.tx_id), "\(name)")
            #expect(got.rejected.map(\.reason) == item.rejected.map(\.reason), "\(name)")
            #expect(got.accepted.map { Int($0.op) } == item.accepted.map(\.op), "\(name)")
            #expect(snap(got.state) == item.state, "\(name)")
        }
    }

    @Test("delivery and bot lookups match")
    func checks() throws {
        let vector = try loadBotsVector()
        for item in vector.checks.delivery_authorized {
            let got = try botReduce(vector, item.reduction)
            let allowed = GroupAdmin.deliveryAuthorized(
                accepted: got.accepted,
                adminTxID: try hexData(item.admin_tx_id),
                sender: try hexData(item.sender),
                recipient: try hexData(item.recipient),
                epoch: item.epoch
            )
            #expect(allowed == item.allowed, "\(item.reduction) \(item.recipient)")
        }
        for item in vector.checks.room_bot {
            let got = try botReduce(vector, item.reduction)
            let state = try #require(got.state)
            let found = try GroupAdmin.roomBot(state: state, account: try hexData(item.account))
            #expect(found.map { BotWire($0.settings) } == item.bot, "\(item.reduction) \(item.account)")
        }
    }

    /// LocalNet replay. ts/scripts/group-bot-localnet.ts posts real notes on LocalNet, records the
    /// confirmed notes and what every other language made of them, and runs this test with
    /// ALGOCHAT_BOT_LOCALNET_RECORD set. The Swift pqcross tool needs macOS 26 for ML-KEM-768,
    /// so on Linux this is how Swift reads the same chain record.
    @Test(
        "localnet chain record drafts and reduces the same way",
        .enabled(if: ProcessInfo.processInfo.environment["ALGOCHAT_BOT_LOCALNET_RECORD"] != nil)
    )
    func localnetChainRecord() throws {
        let path = try #require(ProcessInfo.processInfo.environment["ALGOCHAT_BOT_LOCALNET_RECORD"])
        let record = try JSONDecoder().decode(BotLocalnetRecord.self, from: try Data(contentsOf: URL(fileURLWithPath: path)))
        #expect(!record.drafts.isEmpty)
        #expect(!record.reductions.isEmpty)
        for item in record.drafts {
            #expect(hexString(try botDraft(item)) == item.note, "\(item.name)")
        }
        for (name, item) in record.reductions {
            let got = GroupAdmin.reduce(try botEvents(item.events), parentEvents: try item.parent_events.map(botEvents))
            #expect(got.rejected.map { hexString($0.txID) } == item.rejected.map(\.tx_id), "\(name)")
            #expect(got.rejected.map(\.reason) == item.rejected.map(\.reason), "\(name)")
            #expect(got.accepted.map { Int($0.op) } == item.accepted.map(\.op), "\(name)")
            #expect(snap(got.state) == item.state, "\(name)")
        }
    }

    @Test("bad bot drafts fail with the exact shared sentence")
    func draftSentences() throws {
        let vector = try loadBotsVector()
        let sentences: [String: String] = [
            "add_bot_without_settings": "A bot needs a reply mode and a rate limit",
            "add_bot_no_mode": "Bot reply mode must be mentions, every message, or commands",
            "add_bot_mode_four": "Bot reply mode must be mentions, every message, or commands",
            "set_bot_mode_zero": "Bot reply mode must be mentions, every message, or commands",
            "set_bot_mode_four": "Bot reply mode must be mentions, every message, or commands",
            "add_bot_zero_rate": "Bot rate limit must be from 1 through 65535",
            "add_bot_zero_window": "Bot rate limit must be from 1 through 65535",
            "set_bot_zero_rate": "Bot rate limit must be from 1 through 65535",
            "set_bot_zero_window": "Bot rate limit must be from 1 through 65535",
            "non_admin_add_bot": "Sender cannot add that bot",
            "mark_existing_member": "Sender cannot add that bot",
            "appoint_bot": "A bot cannot be an admin",
            "transfer_to_bot": "A bot cannot own the room",
            "set_bot_on_person": "Sender cannot change that bot",
            "bot_sets_itself": "Sender cannot change that bot",
            "channel_plain_add_of_bot": "A bot joins a channel only when added as a bot",
            "channel_marks_person": "That account is not a bot in the parent room",
        ]
        let named = vector.draft_errors.filter { $0.wide_integer != true }
        #expect(Set(named.map(\.name)) == Set(sentences.keys))
        for item in named {
            let sentence = try #require(sentences[item.name], "\(item.name)")
            expectSentence(sentence, item.name) { try botDraft(item) }
        }
    }

    /// AGENT-7.c: removing a bot is ordinary op 11 with a new room key, and the bot is dropped from
    /// the room's channels with op 11 on each channel.
    @Test("a removed bot is dropped from the room and its channels")
    func removedBotLeavesRoomAndChannels() throws {
        let vector = try loadBotsVector()
        let checks = try #require(vector.checks.channel_departures)
        #expect(!checks.isEmpty)
        for item in checks {
            let channel = try #require(try botReduce(vector, item.channel).state)
            let parent = try #require(try botReduce(vector, item.parent).state)
            let got = try GroupAdmin.channelDepartures(channel: channel, parent: parent)
            #expect(got.map(hexString) == item.departures, "\(item.channel) \(item.parent)")
        }
        for name in ["parent_bot_removed", "channel_bot_removed"] {
            let got = try botReduce(vector, name)
            #expect(got.accepted.last?.op == 11, "\(name)") // op 11, ordinary remove
            let state = try #require(got.state)
            #expect(state.epoch == 2, "\(name)")
            #expect(state.bots.isEmpty, "\(name)")
        }
    }

    /// AGENT-7.b: a key announcement, a chat note, a plain-text flag, a join request and an op 13
    /// naming itself never make an account a bot.
    @Test("nothing an account posts about itself marks it as a bot")
    func selfPostsNeverMarkABot() throws {
        let vector = try loadBotsVector()
        let account = Data(repeating: 5, count: 32)
        let events = try #require(vector.reductions["self_posts_are_not_a_bot"]).events
        #expect(events.filter { $0.sender == hexString(account) }.count == 5)
        let got = try botReduce(vector, "self_posts_are_not_a_bot")
        let state = try #require(got.state)
        #expect(state.members.contains(account))
        #expect(state.bots.isEmpty)
        #expect(try GroupAdmin.roomBot(state: state, account: account) == nil)
        #expect(!got.accepted.contains { $0.op == GroupAdmin.opAddBot })
        let reasons = Dictionary(uniqueKeysWithValues: got.rejected.map { (hexString($0.txID), $0.reason) })
        #expect(reasons[String(repeating: "57", count: 32)] == "Sender cannot add that bot")
        for tx in ["54", "55", "56"] {
            #expect(reasons[String(repeating: tx, count: 32)] == "Not a room administration record", "\(tx)")
        }
    }

    @Test("bot settings ride only on a bot delta record")
    func settingsOnlyOnBotRecords() throws {
        let preset = GroupAdmin.BotSettings(
            mode: GroupAdmin.botModeMentions,
            replies: GroupAdmin.botRatePresetReplies,
            seconds: GroupAdmin.botRatePresetSeconds
        )
        func encode(_ op: UInt8, _ omitted: Bool, _ bot: GroupAdmin.BotSettings?) throws -> Data {
            try GroupAdmin.encodeRecord(
                parent: Data(count: 32),
                groupID: Data(repeating: 7, count: 32),
                mailbox: Data(repeating: 9, count: 32),
                epoch: 1,
                op: op,
                name: Data(),
                policy: GroupAdmin.joiningInvite,
                owner: Data(repeating: 1, count: 32),
                admins: [],
                members: [],
                subject: Data(repeating: 5, count: 32),
                membersOmitted: omitted,
                bot: bot
            )
        }
        expectSentence("Only a bot record carries bot settings") { try encode(7, true, preset) }
        expectSentence("A bot needs a reply mode and a rate limit") { try encode(GroupAdmin.opAddBot, true, nil) }
        expectSentence("A bot record uses the delta note") { try encode(GroupAdmin.opAddBot, false, preset) }
        let note = try encode(GroupAdmin.opAddBot, true, preset)
        #expect(note.count == 205 + GroupAdmin.botSettingsSize)
        #expect([UInt8](note.suffix(5)) == [1, 0, 5, 0, 60])
    }
}

private struct BotWire: Codable, Equatable {
    let mode: Int
    let replies: Int
    let seconds: Int

    init(_ settings: GroupAdmin.BotSettings) {
        mode = Int(settings.mode)
        replies = Int(settings.replies)
        seconds = Int(settings.seconds)
    }

    var settings: GroupAdmin.BotSettings {
        GroupAdmin.BotSettings(mode: UInt8(mode), replies: UInt16(replies), seconds: UInt16(seconds))
    }
}

private struct BotStateWire: Codable, Equatable {
    struct Bot: Codable, Equatable {
        let account: String
        let mode: Int
        let replies: Int
        let seconds: Int
    }

    let group_id: String
    let mailbox: String
    let owner: String
    let admins: [String]
    let members: [String]
    let pending: [String]
    let policy: Int
    let name_hex: String
    let epoch: UInt32
    let head_tx_id: String
    let parent_group_id: String?
    let bots: [Bot]?
}

private struct BotEventWire: Codable {
    let note: String
    let sender: String
    let tx_id: String
    let round: Int
    let offset: Int
}

private struct BotDraftWire: Codable {
    let name: String
    let basis_state: BotStateWire?
    let parent_room: BotStateWire?
    let op: Int
    let sender: String
    let subject: String
    let name_utf8: String?
    let policy: Int?
    let group_id: String?
    let mailbox: String?
    let bot: BotWire?
    let note: String?
    let error_includes: String?
    let wide_integer: Bool?
}

private struct BotReductionWire: Codable {
    struct Accepted: Codable { let op: Int }
    struct Rejected: Codable { let tx_id: String; let reason: String }
    let parent_events: [BotEventWire]?
    let events: [BotEventWire]
    let accepted: [Accepted]
    let rejected: [Rejected]
    let state: BotStateWire?
}

private struct BotChecksWire: Codable {
    struct Delivery: Codable {
        let reduction: String
        let admin_tx_id: String
        let sender: String
        let recipient: String
        let epoch: UInt32
        let allowed: Bool
    }

    struct Lookup: Codable {
        let reduction: String
        let account: String
        let bot: BotWire?
    }

    struct Departures: Codable {
        let channel: String
        let parent: String
        let departures: [String]
    }

    let delivery_authorized: [Delivery]
    let room_bot: [Lookup]
    let channel_departures: [Departures]?
}

private struct BotLocalnetRecord: Codable {
    let drafts: [BotDraftWire]
    let reductions: [String: BotReductionWire]
}

private struct BotsVector: Codable {
    let constants: [String: Int]
    let drafts: [BotDraftWire]
    let draft_errors: [BotDraftWire]
    let reductions: [String: BotReductionWire]
    let checks: BotChecksWire
}

private func loadBotsVector() throws -> BotsVector {
    let url = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent("vectors/group-admin-bots-v1.json")
    return try JSONDecoder().decode(BotsVector.self, from: try Data(contentsOf: url))
}

private func hexData(_ text: String) throws -> Data {
    var out = Data()
    var index = text.startIndex
    while index < text.endIndex {
        let next = text.index(index, offsetBy: 2)
        guard let byte = UInt8(text[index..<next], radix: 16) else {
            throw GroupAdminBotsTestError.badHex
        }
        out.append(byte)
        index = next
    }
    return out
}

private enum GroupAdminBotsTestError: Error {
    case badHex
}

/// The error's text must be exactly `sentence`; any other error fails.
private func expectSentence<T>(
    _ sentence: String,
    _ label: String = "",
    sourceLocation: SourceLocation = #_sourceLocation,
    _ body: () throws -> T
) {
    do {
        _ = try body()
        Issue.record("\(label) did not throw; wanted \(sentence)", sourceLocation: sourceLocation)
    } catch {
        #expect(String(describing: error) == sentence, "\(label)", sourceLocation: sourceLocation)
    }
}

private func hexString(_ data: Data) -> String {
    data.map { String(format: "%02x", $0) }.joined()
}

private func botState(_ wire: BotStateWire?) throws -> GroupAdmin.State? {
    guard let wire else { return nil }
    return GroupAdmin.State(
        groupID: try hexData(wire.group_id),
        mailbox: try hexData(wire.mailbox),
        owner: try hexData(wire.owner),
        admins: try wire.admins.map(hexData),
        members: try wire.members.map(hexData),
        pending: try wire.pending.map(hexData),
        policy: UInt8(wire.policy),
        name: try hexData(wire.name_hex),
        epoch: wire.epoch,
        headTxID: try hexData(wire.head_tx_id),
        parentGroupID: try wire.parent_group_id.map(hexData) ?? Data(count: 32),
        bots: try (wire.bots ?? []).map { item in
            GroupAdmin.RoomBot(
                account: try hexData(item.account),
                settings: GroupAdmin.BotSettings(
                    mode: UInt8(item.mode),
                    replies: UInt16(item.replies),
                    seconds: UInt16(item.seconds)
                )
            )
        }
    )
}

private func snap(_ state: GroupAdmin.State?) -> BotStateWire? {
    guard let state else { return nil }
    return BotStateWire(
        group_id: hexString(state.groupID),
        mailbox: hexString(state.mailbox),
        owner: hexString(state.owner),
        admins: state.admins.map(hexString),
        members: state.members.map(hexString),
        pending: state.pending.map(hexString),
        policy: Int(state.policy),
        name_hex: hexString(state.name),
        epoch: state.epoch,
        head_tx_id: hexString(state.headTxID),
        parent_group_id: hexString(state.parentGroupID),
        bots: state.bots.map {
            BotStateWire.Bot(
                account: hexString($0.account),
                mode: Int($0.settings.mode),
                replies: Int($0.settings.replies),
                seconds: Int($0.settings.seconds)
            )
        }
    )
}

private func botDraft(_ item: BotDraftWire) throws -> Data {
    try GroupAdmin.draft(
        state: try botState(item.basis_state),
        op: UInt8(item.op),
        sender: try hexData(item.sender),
        subject: try hexData(item.subject),
        name: item.name_utf8.map { Data($0.utf8) },
        policy: item.policy.map { UInt8($0) },
        groupID: try item.group_id.map(hexData),
        mailbox: try item.mailbox.map(hexData),
        parentRoom: try botState(item.parent_room),
        bot: item.bot?.settings
    )
}

private func botEvents(_ items: [BotEventWire]) throws -> [GroupAdmin.Event] {
    try items.map {
        GroupAdmin.Event(
            note: try hexData($0.note),
            sender: try hexData($0.sender),
            txID: try hexData($0.tx_id),
            round: $0.round,
            offset: $0.offset
        )
    }
}

private func botReduce(_ vector: BotsVector, _ name: String) throws -> GroupAdmin.Reduced {
    let item = try #require(vector.reductions[name])
    return GroupAdmin.reduce(
        try botEvents(item.events),
        parentEvents: try item.parent_events.map(botEvents)
    )
}
