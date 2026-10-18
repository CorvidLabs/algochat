import AlgoChat
import Algorand
import Foundation

#if canImport(Darwin)
import Darwin
#elseif canImport(Glibc)
import Glibc
#endif

/// Test-only persistence inside the runner's temporary directory. Each restarted
/// process reads contacts and counters from disk without reimporting the contact.
private actor FixtureStorage: PSKStorage {
    private let directory: URL

    init(directory: URL) throws {
        self.directory = directory
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    private func file(for address: String, suffix: String) -> URL {
        directory.appendingPathComponent(address + suffix)
    }

    func storeContact(_ contact: PSKContact) async throws {
        try JSONEncoder().encode(contact).write(to: file(for: contact.address, suffix: ".contact.json"), options: .atomic)
    }

    func retrieveContact(for address: String) async throws -> PSKContact? {
        let url = file(for: address, suffix: ".contact.json")
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        return try JSONDecoder().decode(PSKContact.self, from: Data(contentsOf: url))
    }

    func deleteContact(for address: String) async throws {
        for suffix in [".contact.json", ".state.json"] {
            let url = file(for: address, suffix: suffix)
            if FileManager.default.fileExists(atPath: url.path) {
                try FileManager.default.removeItem(at: url)
            }
        }
    }

    func listContacts() async throws -> [PSKContact] {
        try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
            .filter { $0.lastPathComponent.hasSuffix(".contact.json") }
            .map { try JSONDecoder().decode(PSKContact.self, from: Data(contentsOf: $0)) }
    }

    func storeState(_ state: PSKState, for address: String) async throws {
        try JSONEncoder().encode(state).write(to: file(for: address, suffix: ".state.json"), options: .atomic)
    }

    func retrieveState(for address: String) async throws -> PSKState? {
        let url = file(for: address, suffix: ".state.json")
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        return try JSONDecoder().decode(PSKState.self, from: Data(contentsOf: url))
    }
}

/// No node or indexer is contacted. Every call returns the same synthetic payment.
private actor FixedSearcher: TransactionSearching {
    private let response: Data

    init(fixture: HistoryFixture, recipient: Address, note: Data? = nil, transactionID: String? = nil) throws {
        let object: [String: Any] = [
            "current-round": 1000,
            "transactions": [[
                "id": transactionID ?? fixture.transactionID,
                "sender": fixture.sender,
                "fee": 1000,
                "tx-type": "pay",
                "note": (note ?? fixture.note).base64EncodedString(),
                "confirmed-round": 1000,
                "round-time": 1_700_000_000,
                "payment-transaction": ["receiver": recipient.description, "amount": 0]
            ]]
        ]
        response = try JSONSerialization.data(withJSONObject: object)
    }

    func searchTransactions(
        address: Address?, limit: Int, next: String?, minRound: UInt64?, maxRound: UInt64?
    ) async throws -> TransactionsResponse {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(TransactionsResponse.self, from: response)
    }
}

/// The mnemonic belongs to a newly generated, unfunded test account. This fixture
/// remains in the runner's temporary directory and is never copied to evidence.
private struct HistoryFixture: Codable {
    let recipientMnemonic: String
    let sender: String
    let note: Data
    let transactionID: String
    let plaintext: String
}

private struct Check: Codable {
    let name: String
    let expectedCount: Int
    let actualCount: Int
    let transactionIDs: [String]
    let contents: [String]
    let passed: Bool

    init(name: String, messages: [Message], fixture: HistoryFixture, expectsMessage: Bool = true) {
        self.name = name
        expectedCount = expectsMessage ? 1 : 0
        actualCount = messages.count
        transactionIDs = messages.map(\.id)
        contents = messages.map(\.content)
        passed = expectsMessage
            ? messages.count == 1 && transactionIDs == [fixture.transactionID] && contents == [fixture.plaintext]
            : messages.isEmpty
    }
}

private struct Observation: Encodable {
    let schema = 1
    let phase: String
    let checks: [Check]
    var violations: [String] { checks.filter { !$0.passed }.map(\.name) }
    var result: String { violations.isEmpty ? "passed" : "behavior_violation" }

    private enum CodingKeys: String, CodingKey { case schema, phase, checks, violations, result }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(schema, forKey: .schema)
        try container.encode(phase, forKey: .phase)
        try container.encode(checks, forKey: .checks)
        try container.encode(violations, forKey: .violations)
        try container.encode(result, forKey: .result)
    }

    init(phase: String, checks: [Check]) {
        self.phase = phase
        self.checks = checks
    }
}

private func prepare(directory: URL) async throws -> Observation {
    let sender = try Account()
    let recipient = try Account()
    let chatAccount = try ChatAccount(account: recipient)
    let keys = try KeyDerivation.deriveEncryptionKeys(from: sender)
    let secret = Data(repeating: 0x42, count: 32)
    let contact = PSKContact(address: sender.address.description, initialPSK: secret)
    let currentPSK = PSKRatchet.derivePSKAtCounter(initialPSK: secret, counter: 0)
    let plaintext = "AlgoChat Swift persisted-history regression"
    let envelope = try MessageEncryptor.encryptPSK(
        message: plaintext, senderPrivateKey: keys.0,
        recipientPublicKey: chatAccount.encryptionPublicKey, currentPSK: currentPSK, ratchetCounter: 0
    )
    let fixture = HistoryFixture(
        recipientMnemonic: try recipient.mnemonic(), sender: sender.address.description,
        note: envelope.encode(), transactionID: "SWIFT_HISTORY_PROBE_TRANSACTION", plaintext: plaintext
    )
    try JSONEncoder().encode(fixture).write(to: directory.appendingPathComponent("fixture.json"), options: .atomic)
    let storage = try FixtureStorage(directory: directory.appendingPathComponent("history"))
    let manager = PSKManager(storage: storage)
    try await manager.addContact(contact)
    let searcher = try FixedSearcher(fixture: fixture, recipient: recipient.address)
    let indexer = MessageIndexer(transactionSearcher: searcher, chatAccount: chatAccount, pskManager: manager)
    let first = try await indexer.fetchMessages(with: sender.address)
    let second = try await indexer.fetchMessages(with: sender.address)
    let copiedSearcher = try FixedSearcher(
        fixture: fixture, recipient: recipient.address, transactionID: "SWIFT_HISTORY_PROBE_COPIED_TRANSACTION"
    )
    let copiedIndexer = MessageIndexer(
        transactionSearcher: copiedSearcher, chatAccount: chatAccount, pskManager: manager
    )
    let copiedRead = try await copiedIndexer.fetchMessages(with: sender.address)

    // A separate contact store keeps this assertion independent of history reads.
    let failureStorage = try FixtureStorage(directory: directory.appendingPathComponent("failed-auth"))
    let failureManager = PSKManager(storage: failureStorage)
    try await failureManager.addContact(contact)
    var badNote = Data(fixture.note)
    badNote[badNote.count - 1] ^= 1
    let badSearcher = try FixedSearcher(fixture: fixture, recipient: recipient.address, note: badNote)
    let badIndexer = MessageIndexer(transactionSearcher: badSearcher, chatAccount: chatAccount, pskManager: failureManager)
    let badRead = try await badIndexer.fetchMessages(with: sender.address)
    let goodIndexer = MessageIndexer(transactionSearcher: searcher, chatAccount: chatAccount, pskManager: failureManager)
    let goodRead = try await goodIndexer.fetchMessages(with: sender.address)
    return Observation(phase: "prepare", checks: [
        Check(name: "first_history_read", messages: first, fixture: fixture),
        Check(name: "same_transaction_second_read", messages: second, fixture: fixture),
        Check(name: "new_transaction_same_counter_is_replay", messages: copiedRead, fixture: fixture, expectsMessage: false),
        Check(name: "authentication_failure_returns_no_message", messages: badRead, fixture: fixture, expectsMessage: false),
        Check(name: "authentication_failure_does_not_burn_counter", messages: goodRead, fixture: fixture)
    ])
}

private func restart(directory: URL) async throws -> Observation {
    let fixture = try JSONDecoder().decode(
        HistoryFixture.self, from: Data(contentsOf: directory.appendingPathComponent("fixture.json"))
    )
    let recipient = try Account(mnemonic: fixture.recipientMnemonic)
    let storage = try FixtureStorage(directory: directory.appendingPathComponent("history"))
    let manager = PSKManager(storage: storage)
    let searcher = try FixedSearcher(fixture: fixture, recipient: recipient.address)
    let indexer = MessageIndexer(
        transactionSearcher: searcher, chatAccount: try ChatAccount(account: recipient), pskManager: manager
    )
    let messages = try await indexer.fetchMessages(with: Address(string: fixture.sender))
    return Observation(phase: "restart", checks: [
        Check(name: "same_transaction_after_process_restart", messages: messages, fixture: fixture)
    ])
}

@main private struct SwiftHistoryProbe {
    static func main() async {
        do {
            let arguments = CommandLine.arguments
            guard arguments.count == 4, ["prepare", "restart"].contains(arguments[1]) else {
                throw NSError(domain: "SwiftHistoryProbe", code: 2, userInfo: [
                    NSLocalizedDescriptionKey: "Expected prepare|restart WORK_DIRECTORY OBSERVATIONS_JSON"
                ])
            }
            let directory = URL(fileURLWithPath: arguments[2], isDirectory: true)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let observation: Observation
            if arguments[1] == "prepare" {
                observation = try await prepare(directory: directory)
            } else {
                observation = try await restart(directory: directory)
            }
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            let bytes = try encoder.encode(observation)
            try bytes.write(to: URL(fileURLWithPath: arguments[3]), options: .atomic)
            print(String(decoding: bytes, as: UTF8.self))
            exit(observation.violations.isEmpty ? 0 : 1)
        } catch {
            FileHandle.standardError.write(Data("Swift history probe infrastructure error: \(error)\n".utf8))
            exit(2)
        }
    }
}
