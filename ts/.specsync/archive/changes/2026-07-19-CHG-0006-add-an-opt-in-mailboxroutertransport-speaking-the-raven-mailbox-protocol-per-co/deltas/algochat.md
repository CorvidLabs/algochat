## MODIFIED

### SPEC SECTION Public API

| Export | Contract |
|---|---|
| `X25519KeyPair` | Typed protocol, configuration, or result contract defined by this module. |
| `ChatEnvelope` | Typed protocol, configuration, or result contract defined by this module. |
| `DecryptedContent` | Typed protocol, configuration, or result contract defined by this module. |
| `ReplyContext` | Typed protocol, configuration, or result contract defined by this module. |
| `Message` | Typed protocol, configuration, or result contract defined by this module. |
| `MessageDirection` | Typed protocol, configuration, or result contract defined by this module. |
| `ConversationData` | Typed protocol, configuration, or result contract defined by this module. |
| `SendResult` | Typed protocol, configuration, or result contract defined by this module. |
| `SendOptions` | Typed protocol, configuration, or result contract defined by this module. |
| `SendReplyContext` | Typed protocol, configuration, or result contract defined by this module. |
| `DiscoveredKey` | Typed protocol, configuration, or result contract defined by this module. |
| `PendingMessage` | Typed protocol, configuration, or result contract defined by this module. |
| `PendingMessageStatus` | Typed protocol, configuration, or result contract defined by this module. |
| `EncryptionOptions` | Typed protocol, configuration, or result contract defined by this module. |
| `MessageCache` | Queue, cache, or key-storage abstraction with the persistence behavior defined below. |
| `EncryptionKeyStorage` | Queue, cache, or key-storage abstraction with the persistence behavior defined below. |
| `AlgodClient` | Public package symbol governed by the detailed API and invariants in this contract. |
| `IndexerClient` | Public package symbol governed by the detailed API and invariants in this contract. |
| `BlockchainConfig` | Typed protocol, configuration, or result contract defined by this module. |
| `TransactionInfo` | Typed protocol, configuration, or result contract defined by this module. |
| `NoteTransaction` | Typed protocol, configuration, or result contract defined by this module. |
| `SuggestedParams` | Typed protocol, configuration, or result contract defined by this module. |
| `AccountInfo` | Typed protocol, configuration, or result contract defined by this module. |
| `PaginatedTransactions` | Typed protocol, configuration, or result contract defined by this module. |
| `DiscoverKeyOptions` | Typed protocol, configuration, or result contract defined by this module. |
| `PROTOCOL` | Published protocol value, size boundary, preset, or search default. |
| `SendOptionsPresets` | Published protocol value, size boundary, preset, or search default. |
| `Conversation` | Public orchestration type whose lifecycle and failure behavior are defined below. |
| `InMemoryMessageCache` | Queue, cache, or key-storage abstraction with the persistence behavior defined below. |
| `PublicKeyCache` | Queue, cache, or key-storage abstraction with the persistence behavior defined below. |
| `InMemoryKeyStorage` | Queue, cache, or key-storage abstraction with the persistence behavior defined below. |
| `KeyNotFoundError` | Typed failure or stable error classification for the named operation. |
| `PasswordRequiredError` | Typed failure or stable error classification for the named operation. |
| `DecryptionFailedError` | Typed failure or stable error classification for the named operation. |
| `InvalidKeyDataError` | Typed failure or stable error classification for the named operation. |
| `deriveEncryptionKeys` | Cryptographic key, signature, comparison, or fingerprint operation defined below. |
| `generateEphemeralKeyPair` | Cryptographic key, signature, comparison, or fingerprint operation defined below. |
| `uint8ArrayEquals` | Cryptographic key, signature, comparison, or fingerprint operation defined below. |
| `encryptMessage` | Authenticated standard or PSK encryption operation defined below. |
| `encryptReply` | Authenticated standard or PSK encryption operation defined below. |
| `decryptMessage` | Authenticated standard or PSK encryption operation defined below. |
| `encodeEnvelope` | Binary envelope encoding, decoding, or protocol classification operation. |
| `decodeEnvelope` | Binary envelope encoding, decoding, or protocol classification operation. |
| `isChatMessage` | Binary envelope encoding, decoding, or protocol classification operation. |
| `EncryptionError` | Typed failure or stable error classification for the named operation. |
| `EnvelopeError` | Typed failure or stable error classification for the named operation. |
| `signEncryptionKey` | Cryptographic key, signature, comparison, or fingerprint operation defined below. |
| `verifyEncryptionKey` | Cryptographic key, signature, comparison, or fingerprint operation defined below. |
| `getPublicKey` | Cryptographic key, signature, comparison, or fingerprint operation defined below. |
| `fingerprint` | Cryptographic key, signature, comparison, or fingerprint operation defined below. |
| `SignatureError` | Typed failure or stable error classification for the named operation. |
| `ED25519_SIGNATURE_SIZE` | Published protocol value, size boundary, preset, or search default. |
| `ED25519_PUBLIC_KEY_SIZE` | Published protocol value, size boundary, preset, or search default. |
| `X25519_PUBLIC_KEY_SIZE` | Published protocol value, size boundary, preset, or search default. |
| `ChatError` | Typed failure or stable error classification for the named operation. |
| `ChatErrorCode` | Typed failure or stable error classification for the named operation. |
| `isChatError` | Typed failure or stable error classification for the named operation. |
| `wrapError` | Typed failure or stable error classification for the named operation. |
| `LegacyMessageCache` | Queue, cache, or key-storage abstraction with the persistence behavior defined below. |
| `SendQueue` | Public orchestration type whose lifecycle and failure behavior are defined below. |
| `InMemorySendQueueStorage` | Queue, cache, or key-storage abstraction with the persistence behavior defined below. |
| `SendQueueStorage` | Queue, cache, or key-storage abstraction with the persistence behavior defined below. |
| `EnqueueOptions` | Typed protocol, configuration, or result contract defined by this module. |
| `QueueEventCallback` | Typed protocol, configuration, or result contract defined by this module. |
| `SyncManager` | Public orchestration type whose lifecycle and failure behavior are defined below. |
| `SyncState` | Typed protocol, configuration, or result contract defined by this module. |
| `SyncEvents` | Typed protocol, configuration, or result contract defined by this module. |
| `SyncManagerConfig` | Typed protocol, configuration, or result contract defined by this module. |
| `localnet` | Algorand network configuration constructor or modifier. |
| `testnet` | Algorand network configuration constructor or modifier. |
| `mainnet` | Algorand network configuration constructor or modifier. |
| `withIndexer` | Algorand network configuration constructor or modifier. |
| `parseKeyAnnouncement` | Authenticated encryption-key announcement parsing or discovery operation. |
| `discoverEncryptionKey` | Authenticated encryption-key announcement parsing or discovery operation. |
| `discoverEncryptionKeyFromMessages` | Authenticated encryption-key announcement parsing or discovery operation. |
| `AlgorandService` | Public orchestration type whose lifecycle and failure behavior are defined below. |
| `AlgorandConfig` | Typed protocol, configuration, or result contract defined by this module. |
| `ChatAccount` | Typed protocol, configuration, or result contract defined by this module. |
| `createChatAccountFromMnemonic` | Account validation, creation, or public-key serialization helper. |
| `createRandomChatAccount` | Account validation, creation, or public-key serialization helper. |
| `validateMnemonic` | Account validation, creation, or public-key serialization helper. |
| `validateAddress` | Account validation, creation, or public-key serialization helper. |
| `publicKeyToBase64` | Account validation, creation, or public-key serialization helper. |
| `base64ToPublicKey` | Account validation, creation, or public-key serialization helper. |
| `MessageIndexer` | Public orchestration type whose lifecycle and failure behavior are defined below. |
| `MessageIndexerConfig` | Typed protocol, configuration, or result contract defined by this module. |
| `PaginationOptions` | Typed protocol, configuration, or result contract defined by this module. |
| `WaitForTransactionOptions` | Typed protocol, configuration, or result contract defined by this module. |
| `PSK_PROTOCOL` | Published protocol value, size boundary, preset, or search default. |
| `PSKEnvelope` | Typed protocol, configuration, or result contract defined by this module. |
| `PSKState` | Typed protocol, configuration, or result contract defined by this module. |
| `deriveSessionPSK` | Cryptographic key, signature, comparison, or fingerprint operation defined below. |
| `derivePositionPSK` | Cryptographic key, signature, comparison, or fingerprint operation defined below. |
| `derivePSKAtCounter` | Cryptographic key, signature, comparison, or fingerprint operation defined below. |
| `deriveHybridSymmetricKey` | Cryptographic key, signature, comparison, or fingerprint operation defined below. |
| `deriveSenderKey` | Cryptographic key, signature, comparison, or fingerprint operation defined below. |
| `encodePSKEnvelope` | Binary envelope encoding, decoding, or protocol classification operation. |
| `decodePSKEnvelope` | Binary envelope encoding, decoding, or protocol classification operation. |
| `isPSKMessage` | Binary envelope encoding, decoding, or protocol classification operation. |
| `PSKEnvelopeError` | Typed failure or stable error classification for the named operation. |
| `createPSKState` | PSK exchange, replay-window, or counter-state operation. |
| `validateCounter` | PSK exchange, replay-window, or counter-state operation. |
| `recordReceive` | PSK exchange, replay-window, or counter-state operation. |
| `advanceSendCounter` | PSK exchange, replay-window, or counter-state operation. |
| `createPSKExchangeURI` | PSK exchange, replay-window, or counter-state operation. |
| `parsePSKExchangeURI` | PSK exchange, replay-window, or counter-state operation. |
| `encryptPSKMessage` | Authenticated standard or PSK encryption operation defined below. |
| `decryptPSKMessage` | Authenticated standard or PSK encryption operation defined below. |
| `PSKEncryptionError` | Typed failure or stable error classification for the named operation. |
| `UnsignedTransaction` | Typed protocol, configuration, or result contract defined by this module. |
| `SignedTransaction` | Typed protocol, configuration, or result contract defined by this module. |
| `ChatAccountLike` | Typed protocol, configuration, or result contract defined by this module. |
| `IndexerChatAccount` | Typed protocol, configuration, or result contract defined by this module. |
| `MessageTransaction` | Public orchestration type whose lifecycle and failure behavior are defined below. |
| `MessageTooLargeError` | Typed failure or stable error classification for the named operation. |
| `MAX_NOTE_SIZE` | Published protocol value, size boundary, preset, or search default. |
| `MINIMUM_PAYMENT` | Published protocol value, size boundary, preset, or search default. |
| `PublicKeyNotFoundError` | Typed failure or stable error classification for the named operation. |
| `DEFAULT_PAGE_SIZE` | Published protocol value, size boundary, preset, or search default. |
| `DEFAULT_SEARCH_DEPTH` | Published protocol value, size boundary, preset, or search default. |
| `x25519ECDH` | Cryptographic key, signature, comparison, or fingerprint operation defined below. |
| `PendingStatus` | Typed protocol, configuration, or result contract defined by this module. |
| `createPendingMessage` | Immutable pending-message lifecycle or retry helper. |
| `markSending` | Immutable pending-message lifecycle or retry helper. |
| `markFailed` | Immutable pending-message lifecycle or retry helper. |
| `markSent` | Immutable pending-message lifecycle or retry helper. |
| `canRetry` | Immutable pending-message lifecycle or retry helper. |
| `FileSendQueueStorage` | Queue, cache, or key-storage abstraction with the persistence behavior defined below. |
| `FileKeyStorage` | Queue, cache, or key-storage abstraction with the persistence behavior defined below. |
| `MailboxRouterTransport` | Opt-in raven mailbox transport: put, atomic fan-out put, burn, reclaim, and off-chain box reads against a configured router app id. |
| `MailboxTransportConfig` | Typed protocol, configuration, or result contract defined by this module. |
| `MailboxSubmitOptions` | Typed protocol, configuration, or result contract defined by this module. |
| `MailboxLeg` | Typed protocol, configuration, or result contract defined by this module. |
| `MailboxLegPlan` | Typed protocol, configuration, or result contract defined by this module. |
| `MailboxSendResult` | Typed protocol, configuration, or result contract defined by this module. |
| `MailboxFanoutResult` | Typed protocol, configuration, or result contract defined by this module. |
| `MailboxReadResult` | Typed protocol, configuration, or result contract defined by this module. |
| `MailboxTxnResult` | Typed protocol, configuration, or result contract defined by this module. |
| `deriveMsgKey` | Deterministic raven mailbox key-derivation operation defined below. |
| `deriveMailboxId` | Deterministic raven mailbox key-derivation operation defined below. |
| `mailboxMbr` | Exact mailbox box-MBR computation defined below. |
| `planMailboxPut` | Pure mailbox put planning operation defined below. |
| `planMailboxFanout` | Pure mailbox atomic fan-out planning operation defined below. |
| `mailboxMethodSelector` | ARC-4 method selector derivation defined below. |
| `MAILBOX_METHODS` | Published protocol value, size boundary, preset, or search default. |
| `MAILBOX_MSG_KEY_DOMAIN` | Published protocol value, size boundary, preset, or search default. |
| `MAILBOX_ID_DOMAIN` | Published protocol value, size boundary, preset, or search default. |
| `MAILBOX_MAX_ENVELOPE_SIZE` | Published protocol value, size boundary, preset, or search default. |
| `MAILBOX_TTL_ROUNDS` | Published protocol value, size boundary, preset, or search default. |
| `MAILBOX_BOX_FLAT_MBR` | Published protocol value, size boundary, preset, or search default. |
| `MAILBOX_BOX_BYTE_MBR` | Published protocol value, size boundary, preset, or search default. |
| `MAILBOX_HEADER_SIZE` | Published protocol value, size boundary, preset, or search default. |
| `MAILBOX_REFUND_FEE` | Published protocol value, size boundary, preset, or search default. |
| `MAILBOX_MAX_GROUP_SIZE` | Published protocol value, size boundary, preset, or search default. |
| `MAILBOX_MAX_FANOUT_LEGS` | Published protocol value, size boundary, preset, or search default. |
| `VIEW_SECRET_SIZE` | Published protocol value, size boundary, preset, or search default. |
| `MSG_KEY_SIZE` | Published protocol value, size boundary, preset, or search default. |
| `MAILBOX_ID_SIZE` | Published protocol value, size boundary, preset, or search default. |
| `MAX_COUNTER` | Published protocol value, size boundary, preset, or search default. |
| `MailboxError` | Typed failure or stable error classification for the named operation. |
| `InvalidViewSecretError` | Typed failure or stable error classification for the named operation. |
| `InvalidMsgKeyError` | Typed failure or stable error classification for the named operation. |
| `InvalidCounterError` | Typed failure or stable error classification for the named operation. |
| `MailboxEnvelopeError` | Typed failure or stable error classification for the named operation. |
| `MailboxFanoutLimitError` | Typed failure or stable error classification for the named operation. |

## ADDED

### REQUIREMENT REQ-algochat-021

Mailbox key derivation SHALL implement the raven router normative construction — `msg_key = HMAC-SHA256(key = view_secret, "raven/mailbox/v1" ‖ counter_be32)` and `mailbox_id = SHA-256("raven/mailbox/v1/id" ‖ msg_key)` — with per-message counter rotation, and SHALL reject malformed secrets, keys, and counters.

Acceptance Criteria
- Derivation tests cross-check byte-identical output against an independent Node crypto implementation across counters including 0 and 2^32−1, verify rotation produces distinct keys, and cover wrong-length view secrets, wrong-length msg keys, and non-integer or out-of-range counters.

### REQUIREMENT REQ-algochat-022

Mailbox put planning SHALL fund every leg with exactly `2500 + 400 × (32 + 40 + envelope_len)` microALGO, SHALL reject empty envelopes and envelopes over 2048 bytes, and SHALL reject fan-out groups larger than the Algorand consensus group limit (8 put legs).

Acceptance Criteria
- Planning tests verify the published MBR table (560 B → 0.2553 ALGO, 878 B → 0.3825 ALGO, 2048 B → 0.8505 ALGO), heterogeneous fan-out legs each funded exactly, and every typed rejection path.

### REQUIREMENT REQ-algochat-023

The mailbox transport SHALL be strictly opt-in — exposed by `AlgorandService` only when configured with a mailbox app id — and SHALL route all chain I/O through the injected algod client so verification requires no credentials, wallets, or public-network mutation.

Acceptance Criteria
- Service tests with a stubbed algod client verify single put, atomic fan-out put, burn, and reclaim group shapes with correct ABI selectors, arguments, and box references; off-chain box reads returning depositor, write round, and envelope; and that the transport is absent unless configured.
