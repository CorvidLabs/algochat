import Algorand
@preconcurrency import Crypto
import Foundation
import Testing
@testable import AlgoChat

/// JSON-backed storage so a second manager reloads decoded state, not the same object.
private actor MemoryPSKStorage: PSKStorage {
    private var contacts: [String: Data] = [:]
    private var states: [String: Data] = [:]

    func storeContact(_ contact: PSKContact) async throws {
        contacts[contact.address] = try JSONEncoder().encode(contact)
    }

    func retrieveContact(for address: String) async throws -> PSKContact? {
        guard let data = contacts[address] else { return nil }
        return try JSONDecoder().decode(PSKContact.self, from: data)
    }

    func deleteContact(for address: String) async throws {
        contacts[address] = nil
        states[address] = nil
    }

    func listContacts() async throws -> [PSKContact] {
        try contacts.values.map { try JSONDecoder().decode(PSKContact.self, from: $0) }
    }

    func storeState(_ state: PSKState, for address: String) async throws {
        states[address] = try JSONEncoder().encode(state)
    }

    func retrieveState(for address: String) async throws -> PSKState? {
        guard let data = states[address] else { return nil }
        return try JSONDecoder().decode(PSKState.self, from: data)
    }
}

/// Returns one synthetic payment. No node or indexer is contacted.
private actor FixedSearcher: TransactionSearching {
    private let response: Data

    init(sender: String, recipient: String, note: Data, transactionID: String) throws {
        let object: [String: Any] = [
            "current-round": 1000,
            "transactions": [[
                "id": transactionID,
                "sender": sender,
                "fee": 1000,
                "tx-type": "pay",
                "note": note.base64EncodedString(),
                "confirmed-round": 1000,
                "round-time": 1_700_000_000,
                "payment-transaction": ["receiver": recipient, "amount": 0]
            ] as [String: Any]]
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

@Suite("PSK history")
struct PSKHistoryTests {
    @Test("Same transaction reopens, a copied note does not, and a bad tag records nothing")
    func testPersistedTransactionHistory() async throws {
        // Accounts are generated in the test. Their seeds are not written down.
        let sender = try Account()
        let recipient = try Account()
        let chatAccount = try ChatAccount(account: recipient)
        let senderKeys = try KeyDerivation.deriveEncryptionKeys(from: sender)
        let secret = Data(repeating: 0x42, count: 32)
        let plaintext = "persisted history"
        let transactionID = "PUBLIC_TEST_TRANSACTION"
        let currentPSK = PSKRatchet.derivePSKAtCounter(initialPSK: secret, counter: 0)
        let envelope = try MessageEncryptor.encryptPSK(
            message: plaintext,
            senderPrivateKey: senderKeys.0,
            recipientPublicKey: chatAccount.encryptionPublicKey,
            currentPSK: currentPSK,
            ratchetCounter: 0
        )
        let note = envelope.encode()
        let contact = PSKContact(address: sender.address.description, initialPSK: secret)

        let storage = MemoryPSKStorage()
        let manager = PSKManager(storage: storage)
        try await manager.addContact(contact)

        let searcher = try FixedSearcher(
            sender: sender.address.description,
            recipient: recipient.address.description,
            note: note,
            transactionID: transactionID
        )
        let indexer = MessageIndexer(
            transactionSearcher: searcher,
            chatAccount: chatAccount,
            pskManager: manager
        )

        let first = try await indexer.fetchMessages(with: sender.address)
        #expect(first.map(\.content) == [plaintext])
        #expect(first.map(\.id) == [transactionID])

        let second = try await indexer.fetchMessages(with: sender.address)
        #expect(second.map(\.content) == [plaintext])
        #expect(second.map(\.id) == [transactionID])

        let reloaded = PSKManager(storage: storage)
        let reloadedIndexer = MessageIndexer(
            transactionSearcher: searcher,
            chatAccount: chatAccount,
            pskManager: reloaded
        )
        let afterRestart = try await reloadedIndexer.fetchMessages(with: sender.address)
        #expect(afterRestart.map(\.content) == [plaintext])

        let copied = try FixedSearcher(
            sender: sender.address.description,
            recipient: recipient.address.description,
            note: note,
            transactionID: "PUBLIC_TEST_COPIED_TRANSACTION"
        )
        let copiedIndexer = MessageIndexer(
            transactionSearcher: copied,
            chatAccount: chatAccount,
            pskManager: reloaded
        )
        let replay = try await copiedIndexer.fetchMessages(with: sender.address)
        #expect(replay.isEmpty)

        let failureStorage = MemoryPSKStorage()
        let failureManager = PSKManager(storage: failureStorage)
        try await failureManager.addContact(contact)
        var badNote = note
        badNote[badNote.count - 1] ^= 1
        let badSearcher = try FixedSearcher(
            sender: sender.address.description,
            recipient: recipient.address.description,
            note: badNote,
            transactionID: transactionID
        )
        let badIndexer = MessageIndexer(
            transactionSearcher: badSearcher,
            chatAccount: chatAccount,
            pskManager: failureManager
        )
        let badRead = try await badIndexer.fetchMessages(with: sender.address)
        #expect(badRead.isEmpty)

        let recoveredIndexer = MessageIndexer(
            transactionSearcher: searcher,
            chatAccount: chatAccount,
            pskManager: failureManager
        )
        let recovered = try await recoveredIndexer.fetchMessages(with: sender.address)
        #expect(recovered.map(\.content) == [plaintext])
        #expect(recovered.map(\.id) == [transactionID])
    }
}
