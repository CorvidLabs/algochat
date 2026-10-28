---
module: algochat
version: 4
status: active
files:
  - Sources/AlgoChat/AlgoChat.swift
  - Sources/AlgoChat/Blockchain/MessageIndexer.swift
  - Sources/AlgoChat/Blockchain/MessageTransaction.swift
  - Sources/AlgoChat/Crypto/EphemeralKeyManager.swift
  - Sources/AlgoChat/Crypto/KeyDerivation.swift
  - Sources/AlgoChat/Crypto/MessageEncryptor.swift
  - Sources/AlgoChat/Crypto/PQSession.swift
  - Sources/AlgoChat/Crypto/GroupAdmin.swift
  - Sources/AlgoChat/Crypto/PSKRatchet.swift
  - Sources/AlgoChat/Crypto/SignatureVerifier.swift
  - Sources/AlgoChat/Errors/ChatError.swift
  - Sources/AlgoChat/Models/ChatAccount.swift
  - Sources/AlgoChat/Models/ChatEnvelope.swift
  - Sources/AlgoChat/Models/Conversation.swift
  - Sources/AlgoChat/Models/DiscoveredKey.swift
  - Sources/AlgoChat/Models/EnvelopeDecoder.swift
  - Sources/AlgoChat/Models/Message.swift
  - Sources/AlgoChat/Models/MessagePayload.swift
  - Sources/AlgoChat/Models/PSKContact.swift
  - Sources/AlgoChat/Models/PSKEnvelope.swift
  - Sources/AlgoChat/Models/PSKExchangeURI.swift
  - Sources/AlgoChat/Models/PSKState.swift
  - Sources/AlgoChat/Models/SendOptions.swift
  - Sources/AlgoChat/PSK/PSKManager.swift
  - Sources/AlgoChat/Queue/FileSendQueueStorage.swift
  - Sources/AlgoChat/Queue/PendingMessage.swift
  - Sources/AlgoChat/Queue/SendQueue.swift
  - Sources/AlgoChat/Queue/SyncManager.swift
  - Sources/AlgoChat/Storage/EncryptionKeyStorage.swift
  - Sources/AlgoChat/Storage/FileKeyStorage.swift
  - Sources/AlgoChat/Storage/FilePSKStorage.swift
  - Sources/AlgoChat/Storage/InMemoryMessageCache.swift
  - Sources/AlgoChat/Storage/KeychainKeyStorage.swift
  - Sources/AlgoChat/Storage/MessageCache.swift
  - Sources/AlgoChat/Storage/PSKStorage.swift
  - Sources/AlgoChat/Storage/PublicKeyCache.swift
  - Sources/AlgoChat/Storage/StorageDirectory.swift
  - Sources/AlgoChatCLI/AlgoChatCLI.swift
  - Sources/PQCross/main.swift
db_tables: []
depends_on: []
---

# AlgoChat

## Purpose

Provide a Swift 6, async/await API and CLI for encrypted peer-to-peer messages carried in Algorand payment transaction notes. The library owns standard and PSK wire envelopes, encryption and signing, blockchain publication and discovery, conversation models, durable queues, synchronization, and platform-appropriate local key and contact storage.

The current source release is 1.3.0 and has not received an independent security audit. Its public cryptographic behavior remains interoperable with the other AlgoChat language implementations.

## Public API

The contract includes every public declaration exported by the `AlgoChat` library and the `algochat` executable entry point. The symbol inventory below records the governed Swift sources; structural inventory is separate from behavioral verification.

### Exported Symbols

| Symbol |
|--------|
| `State` | Room administration symbol. |
| `groupID` | Room administration symbol. |
| `mailbox` | Room administration symbol. |
| `parentGroupID` | Parent room group id, or 32 zero bytes when the room is not a channel. |
| `owner` | Room administration symbol. |
| `admins` | Room administration symbol. |
| `members` | Room administration symbol. |
| `policy` | Room administration symbol. |
| `name` | Room administration symbol. |
| `epoch` | Room administration symbol. |
| `headTxID` | Room administration symbol. |
| `Event` | Room administration symbol. |
| `note` | Room administration symbol. |
| `txID` | Room administration symbol. |
| `round` | Room administration symbol. |
| `offset` | Room administration symbol. |
| `Accepted` | Room administration symbol. |
| `op` | Room administration symbol. |
| `subject` | Room administration symbol. |
| `Rejection` | Room administration symbol. |
| `reason` | Room administration symbol. |
| `Reduced` | Room administration symbol. |
| `state` | Room administration symbol. |
| `accepted` | Room administration symbol. |
| `rejected` | Room administration symbol. |
| `Delivery` | Room administration symbol. |
| `groupKey` | Room administration symbol. |
| `adminTxID` | Room administration symbol. |
| `deliverAction` | Room administration symbol. |
| `nameMax` | Room administration symbol. |
| `adminMax` | Room administration symbol. |
| `memberMax` | Maximum members in one room, 256. A new note omits the member list. |
| `membersOmitted` | Member-count sentinel 65535. The note omits the roster. |
| `deliverBatch` | Separate key-delivery payments in one pass, at most 16. |
| `deliverPlaintextSize` | Room administration symbol. |
| `joiningInvite` | Room administration symbol. |
| `joiningAsk` | Room administration symbol. |
| `deliveryNoteSize` | Room administration symbol. |
| `GroupAdmin` | Room administration reducer and action-5 delivery. |
| `draft` | Drafts an authorized 0x03 note. A new note omits the member list. |
| `encodeRecord` | Encodes a 0x03 note, including a legacy full member list. |
| `reduce` | Reduces administration transactions. A delta note rebuilds members from the operation. |
| `senderMayPost` | Whether a member may post at an epoch. |
| `deliveryAuthorized` | Whether one accepted record authorizes a key delivery. |
| `authorizedRecipients` | Members who may receive the room key for one accepted record. |
| `channelDepartures` | Channel members who are no longer in the parent room. |
| `pendingKeyDeliveries` | Recipients still owed a key after landed payments. |
| `nextDeliveryBatch` | The next separate key payments, at most 16. Not an atomic group. |
| `sealKeyDelivery` | Seals a 227-byte 0x06 action-5 delivery. |
| `openKeyDelivery` | Opens a 227-byte 0x06 action-5 delivery. |
| `AlgoChat` |
| `algokit` |
| `account` |
| `pskManager` |
| `conversation` |
| `conversations` |
| `refresh` |
| `loadCached` |
| `loadOlder` |
| `send` |
| `publicKey` |
| `fetchPublicKey` |
| `discoverKey` |
| `publishKey` |
| `publishKeyAndWait` |
| `address` |
| `balance` |
| `clearCache` |
| `invalidateCachedPublicKey` |
| `addPSKContact` |
| `removePSKContact` |
| `hasPSKContact` |
| `pskContacts` |
| `generatePSKExchangeURI` |
| `sendPSK` |
| `init` |
| `TransactionSearching` |
| `searchTransactions` |
| `MessageIndexer` |
| `defaultPageSize` |
| `fetchMessages` |
| `fetchConversations` |
| `defaultDiscoveryPageSize` |
| `findPublicKey` |
| `waitForTransaction` |
| `extractKey` |
| `MessageTransaction` |
| `minimumPayment` |
| `fee` |
| `create` |
| `createSigned` |
| `createSignedKeyPublish` |
| `EphemeralKeyManager` |
| `generateKeyPair` |
| `deriveEncryptionKey` |
| `deriveDecryptionKey` |
| `KeyDerivation` |
| `deriveEncryptionKeys` |
| `encodePublicKey` |
| `decodePublicKey` |
| `MessageEncryptor` |
| `encrypt` |
| `encryptRaw` |
| `decrypt` |
| `encryptPSK` |
| `decryptPSK` |
| `PSKRatchet` |
| `deriveSessionPSK` |
| `derivePositionPSK` |
| `derivePSKAtCounter` |
| `deriveHybridSymmetricKey` |
| `deriveSenderKey` |
| `SignatureVerifier` |
| `signatureSize` |
| `sign` |
| `verify` |
| `fingerprint` |
| `ChatError` |
| `errorDescription` |
| `messageTooLarge` |
| `decryptionFailed` |
| `encodingFailed` |
| `randomGenerationFailed` |
| `invalidPublicKey` |
| `keyDerivationFailed` |
| `invalidSignature` |
| `invalidEnvelope` |
| `unsupportedVersion` |
| `unsupportedProtocol` |
| `indexerNotConfigured` |
| `publicKeyNotFound` |
| `invalidRecipient` |
| `transactionFailed` |
| `insufficientBalance` |
| `pskNotFound` |
| `pskCounterOutOfRange` |
| `pskCounterReplay` |
| `pskSendExhausted` |
| `ChatAccount` |
| `encryptionPublicKey` |
| `saveEncryptionKey` |
| `hasStoredEncryptionKey` |
| `deleteStoredEncryptionKey` |
| `publicKeyData` |
| `description` |
| `ChatEnvelope` |
| `version` |
| `protocolID` |
| `headerSize` |
| `encryptedSenderKeySize` |
| `tagSize` |
| `maxNoteSize` |
| `maxPayloadSize` |
| `senderPublicKey` |
| `ephemeralPublicKey` |
| `encryptedSenderKey` |
| `nonce` |
| `ciphertext` |
| `encode` |
| `decode` |
| `Conversation` |
| `id` |
| `participant` |
| `participantEncryptionKey` |
| `lastFetchedRound` |
| `lastMessage` |
| `lastReceived` |
| `lastSent` |
| `receivedMessages` |
| `sentMessages` |
| `messageCount` |
| `isEmpty` |
| `append` |
| `merge` |
| `DiscoveredKey` |
| `isVerified` |
| `EnvelopeDecoder` |
| `DecodedEnvelope` |
| `isChatMessage` |
| `standard` |
| `psk` |
| `ReplyContext` |
| `messageId` |
| `preview` |
| `Message` |
| `sender` |
| `recipient` |
| `content` |
| `timestamp` |
| `confirmedRound` |
| `Direction` |
| `direction` |
| `replyContext` |
| `ProtocolMode` |
| `protocolMode` |
| `isReply` |
| `==` |
| `hash` |
| `sent` |
| `received` |
| `DecryptedContent` |
| `text` |
| `replyToId` |
| `replyToPreview` |
| `formattedContent` |
| `PSKContact` |
| `initialPSK` |
| `label` |
| `createdAt` |
| `PSKEnvelope` |
| `ratchetCounter` |
| `PSKExchangeURI` |
| `toString` |
| `parse` |
| `PSKState` |
| `sessionSize` |
| `counterWindow` |
| `sendCounter` |
| `peerLastCounter` |
| `seenCounters` |
| `acceptedTransactionIds` |
| `sendExhausted` |
| `validateCounter` |
| `recordReceive` |
| `recordAccepted` |
| `hasAcceptedTransaction` |
| `validateAndRecordReceive` |
| `advanceSendCounter` |
| `SendResult` |
| `txid` |
| `message` |
| `SendOptions` |
| `waitForConfirmation` |
| `timeout` |
| `waitForIndexer` |
| `indexerTimeout` |
| `amount` |
| `confirmed` |
| `indexed` |
| `replying` |
| `withAmount` |
| `PSKManager` |
| `addContact` |
| `removeContact` |
| `hasContact` |
| `getContact` |
| `nextSendCounter` |
| `validateAndDerivePSK` |
| `pskForTransaction` |
| `commitTransaction` |
| `listContacts` |
| `FileSendQueueStorage` |
| `save` |
| `load` |
| `PendingMessage` |
| `retryCount` |
| `lastAttempt` |
| `status` |
| `lastError` |
| `Status` |
| `markSending` |
| `markFailed` |
| `markSent` |
| `canRetry` |
| `pending` |
| `sending` |
| `failed` |
| `SendQueueStorage` |
| `SendQueue` |
| `onPermanentFailure` |
| `enqueue` |
| `dequeue` |
| `getPending` |
| `remove` |
| `clear` |
| `count` |
| `InMemorySendQueueStorage` |
| `SyncManager` |
| `onMessageSent` |
| `onMessageFailed` |
| `onConnectivityChange` |
| `setOnline` |
| `online` |
| `syncIfNeeded` |
| `sync` |
| `queueMessage` |
| `pendingMessages` |
| `retry` |
| `syncing` |
| `EncryptionKeyStorage` |
| `KeyStorageError` |
| `store` |
| `retrieve` |
| `hasKey` |
| `delete` |
| `listStoredAddresses` |
| `keyNotFound` |
| `storageFailed` |
| `retrievalFailed` |
| `biometricNotAvailable` |
| `biometricFailed` |
| `invalidKeyData` |
| `passwordRequired` |
| `directoryNotFound` |
| `FileKeyStorage` |
| `setPassword` |
| `clearPassword` |
| `FilePSKStorage` |
| `storeContact` |
| `retrieveContact` |
| `deleteContact` |
| `storeState` |
| `retrieveState` |
| `InMemoryMessageCache` |
| `getLastSyncRound` |
| `setLastSyncRound` |
| `getCachedConversations` |
| `KeychainKeyStorage` |
| `authenticationPrompt` |
| `isBiometricAvailable` |
| `biometricType` |
| `BiometricType` |
| `none` |
| `touchID` |
| `faceID` |
| `opticID` |
| `MessageCache` |
| `MessageCacheError` |
| `notFound` |
| `PSKStorage` |
| `PublicKeyCacheProtocol` |
| `PublicKeyCache` |
| `ttl` |
| `invalidate` |
| `pruneExpired` |
| `StorageDirectory` |
| `defaultDirectoryName` |
| `resolve` |

### Existing hybrid/session exports

| Symbol | Existing behavior |
|---|---|
| `PQProtocol` | Version `0x02`, handshake `0x04`, data `0x05`, 2366-byte handshake, 78-byte data header and 4002-byte plaintext maximum. |
| `PQAnnouncement` | ACPQ encapsulation-key note detection, encoding and optional Ed25519 verification. |
| `PQSession` | Hybrid session key, participant keys and SHA-256 handshake identity. |
| `encapsKey` | Announcement encapsulation-key bytes. |
| `magic` | ACPQ note prefix. |
| `isAnnouncement` | Announcement prefix detection. |
| `sessionKey` | Shared session encryption key. |
| `recipientPublicKey` | Session recipient's X25519 public key. |
| `handshakeID` | Session identity derived from the handshake; also the handshake protocol identifier on `PQProtocol`. |
| `messageID` | Session-data protocol identifier. |
| `encapsKeySize` | ML-KEM-768 encapsulation-key width. |
| `ciphertextSize` | ML-KEM-768 ciphertext width. |
| `sharedSecretSize` | Shared-secret width. |
| `nonceSize` | Session nonce width. |
| `wrappedKeySize` | Wrapped session-key width. |
| `handshakeSize` | Encoded handshake width. |
| `messageHeaderSize` | Encoded session-data header width. |
| `isHandshake` | Recognize the version/identifier and fixed handshake length. |
| `isMessage` | Recognize the version/identifier and minimum data length. |
| `encapsulationPrivateKey` | Derive ML-KEM-768 material from account seed, Apple OS 26 only. |
| `deriveHybridKey` | Transcript-bound X25519 + ML-KEM shared-secret combiner. |
| `initiate` | Build the hybrid handshake/session, Apple OS 26 only. |
| `accept` | Open the handshake as recipient, Apple OS 26 only. |
| `openAsSender` | Recover the hybrid session via sender wrap, Apple OS 26 only. |
| `envelopeVersion` | Existing standard/PSK envelope instance version. |
| `headerData` | Existing standard-envelope fixed header, used as AAD for version `0x02`. |

The existing `encode`, `parse`, `encrypt` and `decrypt` names also apply to hybrid announcements/session data. `Sources/PQCross/main.swift` is the `pqcross` fixture adapter. The high-level `AlgoChat` client/indexer does not route `0x04` or `0x05` notes. ML-KEM methods are omitted on Linux, while non-ML-KEM helpers remain compiled.

## Implementation status

Standard/PSK writers emit version `0x01`; decoding/decryption also accepts version `0x02` with header AAD. Inbound standard and PSK decoders reject a note longer than 4096 bytes before they return an envelope, and they still require a complete authentication tag. Unsupported-platform `KeychainKeyStorage` uses ephemeral process memory, and PSK contact/state files and the file send queue are plaintext JSON. Those storage facts remain gaps and do not relax the accepted requirements; see the [accuracy ledger](../../../docs/ACCURACY.md).

## Invariants

1. Standard envelopes are written with version `0x01` and also read version `0x02` with header AAD; they use protocol `0x01`, a 126-byte header, and a 4,096-byte transaction-note ceiling; PSK envelopes use protocol `0x02` and a 130-byte header. A maximum plaintext encodes to exactly 4,096 bytes.
2. Standard encryption combines a fresh X25519 ephemeral key, HKDF-SHA256 domain separation, and ChaCha20-Poly1305; sender-key wrapping permits both participants to decrypt the stored message.
3. PSK mode combines the ratcheted 32-byte pre-shared key with ephemeral ECDH, rejects replayed or out-of-window counters, and records a receive counter and transaction id only after successful decryption. Reading an already accepted transaction returns that message and does not require the counter to be unseen. A copied note under a new transaction id is a replay and contributes no message. The send counter may return `4294967295` once, then stays exhausted: the stored next counter is not `0`, and that exhaustion survives Codable decoding. Older state JSON without transaction ids or the exhaustion flag still decodes.
4. On-chain message and key-publication transactions use the configured payment amount, never exceeding the 4,096-byte note limit; the default amount is 1,000 microAlgos. The fee is one minimum fee plus the rounded note surcharge for bytes past 1,024. Ed25519 does not add Falcon fees.
5. Queue, cache, storage, and client state exposed across concurrency boundaries remain actor-isolated or `Sendable`.
6. Key-publish payloads are discovery metadata and are not returned as chat messages.
7. Reply metadata preserves the original transaction identifier and limits its preview to 80 characters while remaining backward-compatible with plain-text payloads.
8. This governance migration changes specifications and verification configuration only; it does not change package source or test behavior.

## Behavioral Examples

### Scenario: Send and retrieve a standard encrypted message

- **Given** a local account and a recipient whose X25519 public key can be discovered
- **When** `AlgoChat.send` creates and submits a message with standard send options
- **Then** the note contains a valid standard envelope, the returned `SendResult` contains the transaction identifier and optimistic message, and indexer refresh reconstructs the conversation

### Scenario: Exchange a ratcheted PSK message

- **Given** both contacts share the same 32-byte PSK and persisted counter state
- **When** the sender advances its counter and sends through `sendPSK`
- **Then** the recipient derives the matching counter key, authenticates and decrypts the envelope, records the counter and transaction id, returns the same plaintext when that transaction is fetched again, and rejects a copy under a different transaction id

### Scenario: Continue after temporary send failure

- **Given** a durable pending message and an offline or failing transport
- **When** synchronization resumes
- **Then** the queue retries up to its configured limit, persists each state transition, removes successful entries, and reports permanent failure without reporting a false send

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Envelope version, protocol, length, key length, nonce, or authentication is invalid | Decoding or decryption fails with a typed `ChatError`; unauthenticated content is not emitted |
| Recipient public key cannot be discovered | The send operation fails rather than encrypting to an unknown identity |
| PSK contact is missing, malformed, replayed, or outside its counter window | PSK management throws and does not advance persisted receive state on failed decryption. An exhausted send counter throws and leaves the stored counter unchanged |
| Blockchain submission, confirmation, or indexer visibility times out | The requested send/fetch operation throws or remains queued according to `SendOptions` |
| Key, contact, state, or queue persistence is unavailable or corrupt | The storage implementation returns its documented error and does not silently replace durable state |
| A platform lacks Apple Keychain or biometric APIs | The cross-platform storage implementation reports unsupported behavior; file storage remains available |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| `swift-algokit` | Algorand clients, accounts, addresses, payment transactions, signing, confirmation, and indexer access |
| `swift-crypto` | X25519 key agreement, ChaCha20-Poly1305, HKDF-SHA256, and cryptographic key material |
| `swift-cli` | Executable command routing and terminal interaction |
| Foundation / Security / LocalAuthentication | Encoding, files, platform keychain access, and optional biometric policy |

### Consumed By

| Module | What is used |
|--------|-------------|
| Swift applications | `AlgoChat` client, models, encryption helpers, queues, storage protocols, and PSK APIs |
| `algochat` executable | Interactive account, conversation, message, and PSK workflows |
| Other AlgoChat implementations | Shared versioned envelope and cryptographic interoperability contract |

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2026-10-18 | parity | Persist accepted PSK transaction ids and stop the send counter from wrapping |
| 2026-10-16 | 0xLeif | Raise the note ceiling to 4,096 bytes (protocol revision 1.2.1) and price the consensus note fee |
| 2026-07-14 | 0xLeif | Establish complete canonical contract coverage for the implemented Swift package |
| 2026-07-14 | SpecSync | Accepted CHG-0002 complete canonical Swift AlgoChat contract coverage |
| 2026-07-14 | SpecSync | Accepted CHG-0003 non-semantic rollout review corrections |
| 2026-07-14 | SpecSync | CHG-0004-cover-the-codex-agent-integration-during-hosted-pull-request-validation: Cover the Codex agent integration during hosted pull-request validation |

## Purpose and Contract Coverage

The canonical module governs every implemented Swift library and CLI source, its complete detected public export surface, and its standard/PSK messaging, blockchain, queue, synchronization, cache, and storage responsibilities.
