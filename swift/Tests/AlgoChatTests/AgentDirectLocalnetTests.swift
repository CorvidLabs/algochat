import Foundation
import Testing
@testable import AlgoChat

/// One-to-one bot messages from LocalNet (AGENT-5).
///
/// py/tests/test_agent_direct_localnet.py has a bot read and answer real 0x01 notes on LocalNet,
/// records every confirmed note, and runs this test with ALGOCHAT_DM_LOCALNET_RECORD set. The Swift
/// pqcross tool needs macOS 26 for ML-KEM-768, so on Linux this is how Swift reads the same notes.
@Suite("Agent direct messages on LocalNet")
struct AgentDirectLocalnetTests {
    @Test(
        "localnet bot conversation opens for both sides",
        .enabled(if: ProcessInfo.processInfo.environment["ALGOCHAT_DM_LOCALNET_RECORD"] != nil)
    )
    func localnetConversation() throws {
        let path = try #require(ProcessInfo.processInfo.environment["ALGOCHAT_DM_LOCALNET_RECORD"])
        let record = try JSONDecoder().decode(DirectRecord.self, from: try Data(contentsOf: URL(fileURLWithPath: path)))
        let bot = try KeyDerivation.deriveEncryptionKeys(fromSeed: try dmHex(record.bot_seed))
        let person = try KeyDerivation.deriveEncryptionKeys(fromSeed: try dmHex(record.person_seed))
        #expect(record.notes.contains { $0.reply_to != nil })
        #expect(record.notes.contains { $0.reply_to == nil })
        for note in record.notes {
            let envelope = try ChatEnvelope.decode(from: try dmHex(note.note))
            for key in [bot.privateKey, person.privateKey] {
                let opened = try #require(try MessageEncryptor.decrypt(envelope: envelope, recipientPrivateKey: key), "\(note.name)")
                #expect(opened.text == note.text, "\(note.name)")
                #expect(opened.replyToId == note.reply_to, "\(note.name)")
                #expect(opened.replyToPreview == note.reply_preview, "\(note.name)")
            }
        }
        // Written last so the harness knows every check above ran.
        if let done = ProcessInfo.processInfo.environment["ALGOCHAT_DM_LOCALNET_DONE"] {
            try Data("\(record.notes.count)\n".utf8).write(to: URL(fileURLWithPath: done))
        }
    }
}

private struct DirectRecord: Decodable {
    let bot_seed: String
    let person_seed: String
    let notes: [DirectNote]
}

private struct DirectNote: Decodable {
    let name: String
    let note: String
    let text: String
    let reply_to: String?
    let reply_preview: String?
}

private func dmHex(_ text: String) throws -> Data {
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
