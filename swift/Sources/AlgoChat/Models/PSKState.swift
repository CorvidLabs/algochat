import Foundation

/// Ratchet counter state for PSK messaging with a specific contact
public struct PSKState: Sendable, Codable {
    // MARK: - Constants

    /// Number of positions per session
    public static let sessionSize: UInt32 = 100

    /// Window of counter values to accept around peerLastCounter
    public static let counterWindow: UInt32 = 200

    // MARK: - Properties

    /// The next counter value to use when sending
    public var sendCounter: UInt32

    /// The highest counter value received from the peer
    public var peerLastCounter: UInt32

    /// Set of counter values we have seen (for replay detection)
    public var seenCounters: Set<UInt32>

    /// Transaction ids whose plaintext was accepted. A later read of one of
    /// these ids is the same message, not a new counter use.
    public var acceptedTransactionIds: Set<String>

    /// True after the last legal send counter has been issued. The next
    /// counter stays at `UInt32.max` and is not wrapped to 0.
    public var sendExhausted: Bool

    // MARK: - Initialization

    /// Creates a new PSK state with default values
    public init() {
        self.sendCounter = 0
        self.peerLastCounter = 0
        self.seenCounters = []
        self.acceptedTransactionIds = []
        self.sendExhausted = false
    }

    /// Creates a PSK state with specific values
    public init(
        sendCounter: UInt32,
        peerLastCounter: UInt32,
        seenCounters: Set<UInt32>,
        acceptedTransactionIds: Set<String> = [],
        sendExhausted: Bool = false
    ) {
        self.sendCounter = sendCounter
        self.peerLastCounter = peerLastCounter
        self.seenCounters = seenCounters
        self.acceptedTransactionIds = acceptedTransactionIds
        self.sendExhausted = sendExhausted
    }

    // MARK: - Codable

    private enum CodingKeys: String, CodingKey {
        case sendCounter
        case peerLastCounter
        case seenCounters
        case acceptedTransactionIds
        case sendExhausted
    }

    /// Older stored state has no transaction-id set and no exhaustion flag.
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        sendCounter = try container.decode(UInt32.self, forKey: .sendCounter)
        peerLastCounter = try container.decode(UInt32.self, forKey: .peerLastCounter)
        seenCounters = try container.decode(Set<UInt32>.self, forKey: .seenCounters)
        acceptedTransactionIds = try container.decodeIfPresent(Set<String>.self, forKey: .acceptedTransactionIds) ?? []
        sendExhausted = try container.decodeIfPresent(Bool.self, forKey: .sendExhausted) ?? false
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(sendCounter, forKey: .sendCounter)
        try container.encode(peerLastCounter, forKey: .peerLastCounter)
        try container.encode(seenCounters, forKey: .seenCounters)
        try container.encode(acceptedTransactionIds, forKey: .acceptedTransactionIds)
        try container.encode(sendExhausted, forKey: .sendExhausted)
    }

    // MARK: - Counter Operations

    /**
     Validates a received counter value without recording it

     Call this before attempting decryption. If decryption succeeds,
     call `recordReceive(_:)` to commit the counter.

     - Parameter counter: The received ratchet counter
     - Throws: `ChatError.pskCounterReplay` if the counter was already seen
     - Throws: `ChatError.pskCounterOutOfRange` if the counter is outside the acceptance window
     */
    public func validateCounter(_ counter: UInt32) throws {
        // Check for replay
        if seenCounters.contains(counter) {
            throw ChatError.pskCounterReplay
        }

        let bounds = Self.acceptanceWindow(around: peerLastCounter)
        guard counter >= bounds.lower && counter <= bounds.upper else {
            throw ChatError.pskCounterOutOfRange
        }
    }

    /**
     Records a successfully decrypted counter value

     Call this only after decryption succeeds to avoid burning
     counters on failed decryptions.

     - Parameter counter: The counter value to record
     */
    public mutating func recordReceive(_ counter: UInt32) {
        seenCounters.insert(counter)
        if counter > peerLastCounter {
            peerLastCounter = counter
        }
        pruneSeenCounters()
    }

    /**
     Records a counter and the transaction that carried it.

     Transaction ids are not pruned with the counter window. Reading that
     transaction again must still find the id after old counters are dropped.
     */
    public mutating func recordAccepted(counter: UInt32, transactionId: String) {
        recordReceive(counter)
        acceptedTransactionIds.insert(transactionId)
    }

    /// Whether this transaction's plaintext was already accepted.
    public func hasAcceptedTransaction(_ transactionId: String) -> Bool {
        acceptedTransactionIds.contains(transactionId)
    }

    /**
     Validates and records a received counter value

     Convenience that combines `validateCounter` and `recordReceive`.
     Use the two-phase API when decryption may fail between validation and recording.

     - Parameter counter: The received ratchet counter
     - Throws: `ChatError.pskCounterReplay` if the counter was already seen
     - Throws: `ChatError.pskCounterOutOfRange` if the counter is outside the acceptance window
     */
    public mutating func validateAndRecordReceive(_ counter: UInt32) throws {
        try validateCounter(counter)
        recordReceive(counter)
    }

    /**
     Advances the send counter and returns the current value.

     The value `UInt32.max` may be returned once. That call marks send state
     exhausted and leaves the stored counter at `UInt32.max`. A later call
     throws and does not change state.

     - Returns: The counter value to use for this send
     - Throws: `ChatError.pskSendExhausted` when no further send counter exists
     */
    public mutating func advanceSendCounter() throws -> UInt32 {
        if sendExhausted {
            throw ChatError.pskSendExhausted
        }
        let current = sendCounter
        if current == .max {
            sendExhausted = true
            return current
        }
        sendCounter += 1
        return current
    }

    // MARK: - Private

    /// Counters accepted around the highest counter seen so far.
    /// Before any receive, `peerLastCounter` is 0, so the window is `0...200`.
    static func acceptanceWindow(around highest: UInt32) -> (lower: UInt32, upper: UInt32) {
        let lower: UInt32
        if highest > counterWindow {
            lower = highest - counterWindow
        } else {
            lower = 0
        }
        let upperResult = highest.addingReportingOverflow(counterWindow)
        let upper: UInt32 = upperResult.overflow ? .max : upperResult.partialValue
        return (lower, upper)
    }

    /// Removes seen counters that are below the acceptance window
    private mutating func pruneSeenCounters() {
        guard peerLastCounter > Self.counterWindow else { return }
        let cutoff = peerLastCounter - Self.counterWindow
        seenCounters = seenCounters.filter { $0 >= cutoff }
    }
}
