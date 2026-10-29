import Foundation
import Testing
@testable import AlgoChat

/// Room and channel bot messages from LocalNet (AGENT-6, AGENT-7, AGENT-8).
///
/// py/tests/test_agent_rooms_localnet.py has a bot join a room and a channel on LocalNet, answer
/// real 0x07 notes, get removed and leave; py/tests/test_agent_policy_localnet.py has it follow
/// reply modes and rate limits that admins change. It records every confirmed room note with its room key
/// and every room's administration chain, then runs this test with ALGOCHAT_ROOMS_LOCALNET_RECORD
/// set. The Swift pqcross tool needs macOS 26 for ML-KEM-768, so on Linux this is how Swift reads
/// the same notes and reduces the same chains.
@Suite("Agent rooms on LocalNet")
struct AgentRoomsLocalnetTests {
    @Test(
        "localnet bot room notes open and room chains reduce the same way",
        .enabled(if: ProcessInfo.processInfo.environment["ALGOCHAT_ROOMS_LOCALNET_RECORD"] != nil)
    )
    func localnetRooms() throws {
        let path = try #require(ProcessInfo.processInfo.environment["ALGOCHAT_ROOMS_LOCALNET_RECORD"])
        let record = try JSONDecoder().decode(RoomsRecord.self, from: try Data(contentsOf: URL(fileURLWithPath: path)))
        #expect(!record.notes.isEmpty)
        #expect(record.notes.contains { $0.from_bot })
        #expect(record.notes.contains { !$0.from_bot })
        for note in record.notes {
            let opened = try GroupMailbox.openGroupMessage(
                note: try roomHex(note.note),
                groupKey: try roomHex(note.key),
                senderAddress: try roomHex(note.sender),
                accepted: []
            )
            #expect(String(data: opened.plaintext, encoding: .utf8) == note.text, "\(note.name)")
            #expect(opened.epoch == note.epoch, "\(note.name)")
            #expect(opened.counter == note.counter, "\(note.name)")
            #expect(hexText(opened.groupID) == note.group_id, "\(note.name)")
        }
        for (name, room) in record.rooms {
            let got = GroupAdmin.reduce(try roomEvents(room.events), parentEvents: try room.parent_events.map(roomEvents))
            #expect(got.rejected.isEmpty, "\(name)")
            let state = try #require(got.state, "\(name)")
            #expect(state.epoch == room.epoch, "\(name)")
            #expect(state.members.map(hexText).sorted() == room.members.sorted(), "\(name)")
            #expect(state.bots.map { hexText($0.account) } == room.bots, "\(name)")
            // Reply mode, replies and window seconds per bot, in account order (AGENT-8, AGENT-10.a).
            #expect(
                state.bots.map { [Int($0.settings.mode), Int($0.settings.replies), Int($0.settings.seconds)] }
                    == room.bot_settings,
                "\(name)"
            )
            #expect(hexText(state.parentGroupID) == room.parent_group_id, "\(name)")
        }
        // Written last so the harness knows every check above ran.
        if let done = ProcessInfo.processInfo.environment["ALGOCHAT_ROOMS_LOCALNET_DONE"] {
            try Data("\(record.notes.count) \(record.rooms.count)\n".utf8).write(to: URL(fileURLWithPath: done))
        }
    }
}

private struct RoomsRecord: Decodable {
    let notes: [RoomNote]
    let rooms: [String: RoomChain]
}

private struct RoomNote: Decodable {
    let name: String
    let note: String
    let key: String
    let sender: String
    let text: String
    let epoch: UInt32
    let counter: UInt32
    let group_id: String
    let from_bot: Bool
}

private struct RoomChain: Decodable {
    let events: [RoomEvent]
    let parent_events: [RoomEvent]?
    let epoch: UInt32
    let members: [String]
    let bots: [String]
    let bot_settings: [[Int]]
    let parent_group_id: String
}

private struct RoomEvent: Decodable {
    let note: String
    let sender: String
    let tx_id: String
    let round: Int
    let offset: Int
}

private func roomEvents(_ items: [RoomEvent]) throws -> [GroupAdmin.Event] {
    try items.map {
        GroupAdmin.Event(
            note: try roomHex($0.note),
            sender: try roomHex($0.sender),
            txID: try roomHex($0.tx_id),
            round: $0.round,
            offset: $0.offset
        )
    }
}

private func hexText(_ data: Data) -> String {
    data.map { String(format: "%02x", $0) }.joined()
}

private func roomHex(_ text: String) throws -> Data {
    guard text.count.isMultiple(of: 2) else { throw ChatError.decryptionFailed("odd hex") }
    var out = Data()
    var index = text.startIndex
    while index < text.endIndex {
        let next = text.index(index, offsetBy: 2)
        guard let byte = UInt8(text[index..<next], radix: 16) else { throw ChatError.decryptionFailed("bad hex") }
        out.append(byte)
        index = next
    }
    return out
}
