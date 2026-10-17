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


### REQUIREMENT REQ-algochat-001

Standard encryption SHALL derive fresh ephemeral X25519 material and authenticate every plaintext with ChaCha20-Poly1305.

Acceptance Criteria
- Round-trip, wrong-key, tampering, empty-message, Unicode, and reply-context tests exercise `encryptMessage`, `encryptReply`, and `decryptMessage`.

### REQUIREMENT REQ-algochat-002

Standard envelope encoding SHALL be deterministic and SHALL reject invalid version, protocol, length, or truncated input.

Acceptance Criteria
- `encodeEnvelope`, `decodeEnvelope`, and `isChatMessage` tests cover valid and malformed binary data.

### REQUIREMENT REQ-algochat-003

Encryption-key announcements SHALL bind an Algorand signing identity to an X25519 public key with Ed25519 signatures.

Acceptance Criteria
- Signature round trips pass and wrong messages, wrong keys, mutations, and invalid key sizes fail.

### REQUIREMENT REQ-algochat-004

Key discovery SHALL scan configured indexer results, validate announcements, and return the newest valid key without accepting malformed or forged notes.

Acceptance Criteria
- Discovery tests cover direct parsing, paginated search, invalid signatures, malformed notes, and no-key results.

### REQUIREMENT REQ-algochat-005

Message transactions SHALL use the protocol minimum payment, encode the encrypted envelope as a note, and reject notes larger than `MAX_NOTE_SIZE` before submission.

Acceptance Criteria
- Transaction construction exposes `MINIMUM_PAYMENT`, enforces 1,024 bytes, and preserves signed and unsigned transaction types.

### REQUIREMENT REQ-algochat-006

PSK encryption SHALL combine ephemeral ECDH material with the counter-derived PSK so neither input alone produces the message key.

Acceptance Criteria
- PSK tests cover successful round trips, wrong PSK, wrong recipient key, tampering, and sender-side decryption.

### REQUIREMENT REQ-algochat-007

The PSK ratchet SHALL derive deterministic session and position keys, with a new session every 100 counters.

Acceptance Criteria
- Boundary tests distinguish positions and sessions and verify `derivePSKAtCounter` against explicit session/position derivation.

### REQUIREMENT REQ-algochat-008

PSK receive state SHALL reject replays and counters outside its accepted forward window, while send counters advance exactly once per message.

Acceptance Criteria
- State tests cover first receive, out-of-order accepted counters, duplicates, excessive gaps, and immutable send advancement.

### REQUIREMENT REQ-algochat-009

PSK envelopes and exchange URIs SHALL round-trip all required fields and SHALL reject malformed, unsupported, or unsafe inputs.

Acceptance Criteria
- Binary envelope and `algochat://` URI tests cover valid labels, encoding, malformed keys, versions, protocols, counters, and lengths.

### REQUIREMENT REQ-algochat-010

`AlgorandService` SHALL compose account creation, key discovery, message encryption, submission, fetching, and reply behavior through injectable clients.

Acceptance Criteria
- Service tests use deterministic mocks to verify send, reply, discovery, fetch, and failure propagation without live network mutation.

### REQUIREMENT REQ-algochat-011

Mnemonic and address helpers SHALL validate Algorand inputs and SHALL round-trip encryption public keys through base64.

Acceptance Criteria
- Tests cover valid and invalid mnemonics/addresses, random and restored accounts, and base64 conversions.

### REQUIREMENT REQ-algochat-012

Indexed message retrieval SHALL paginate, filter participants, decrypt supported notes, ignore unrelated or malformed notes, de-duplicate transactions, and sort chronologically.

Acceptance Criteria
- Indexer tests cover multiple pages, participant directions, malformed notes, duplicates, pagination limits, and conversation assembly.

### REQUIREMENT REQ-algochat-013

Conversation models SHALL retain participant identity and ordered messages and SHALL derive the latest message from the resulting order.

Acceptance Criteria
- Conversation tests cover construction, insertion order, duplicate handling, and last-message updates.

### REQUIREMENT REQ-algochat-014

Pending-message helpers SHALL return immutable state transitions and enforce the configured retry ceiling.

Acceptance Criteria
- Creation, sending, failure, success, retry-count, and `canRetry` behavior are deterministic.

### REQUIREMENT REQ-algochat-015

`SendQueue` SHALL persist queued work, process eligible messages in order, emit lifecycle events, and retain failed items for bounded retry.

Acceptance Criteria
- Queue tests cover enqueue, ordering, concurrency exclusion, retries, events, cancellation, restoration, and successful removal.

### REQUIREMENT REQ-algochat-016

`SyncManager` SHALL expose idle, syncing, and offline states and SHALL coordinate queue processing with connectivity and periodic synchronization.

Acceptance Criteria
- The native build type-checks the public state/events/configuration contract and queue integration.

### REQUIREMENT REQ-algochat-017

In-memory and file-backed caches SHALL support bounded lookup, update, deletion, and clearing without changing caller-owned message values.

Acceptance Criteria
- Cache tests cover capacity behavior, replacement, lookup, removal, and clearing.

### REQUIREMENT REQ-algochat-018

File-backed key storage SHALL require a password where configured, authenticate encrypted data, replace files atomically, and distinguish missing, invalid, and undecryptable data.

Acceptance Criteria
- The native suite exercises storage round trips and typed `KeyNotFoundError`, `PasswordRequiredError`, `DecryptionFailedError`, and `InvalidKeyDataError` paths.

### REQUIREMENT REQ-algochat-019

Public errors SHALL preserve stable machine-readable `ChatErrorCode` classification while retaining contextual human-readable cause information.

Acceptance Criteria
- `isChatError` narrows package errors and `wrapError` preserves existing errors or wraps unknown failures with context.

### REQUIREMENT REQ-algochat-020

The package SHALL disclose that encryption protects content but not public addresses, timing, or transaction activity.

Acceptance Criteria
- The canonical specification and README security table both state the metadata and traffic-analysis limitation.
