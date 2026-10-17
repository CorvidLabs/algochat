---
module: algochat
version: 7
status: stable
files:
  - src/index.ts
  - src/blockchain/discovery.test.ts
  - src/blockchain/discovery.ts
  - src/blockchain/index.ts
  - src/blockchain/interfaces.ts
  - src/blockchain/message-indexer.test.ts
  - src/blockchain/message-indexer.ts
  - src/blockchain/message-transaction.ts
  - src/blockchain/types.ts
  - src/cache/MessageCache.ts
  - src/cache/PublicKeyCache.test.ts
  - src/cache/PublicKeyCache.ts
  - src/cache/index.ts
  - src/crypto/encryption.test.ts
  - src/crypto/encryption.ts
  - src/crypto/envelope.ts
  - src/crypto/index.ts
  - src/crypto/keys.ts
  - src/crypto/signature.test.ts
  - src/crypto/signature.ts
  - src/errors/ChatError.ts
  - src/errors/index.ts
  - src/models/Conversation.test.ts
  - src/models/Conversation.ts
  - src/models/index.ts
  - src/models/pending-message.ts
  - src/models/types.ts
  - src/psk/encryption.ts
  - src/psk/envelope.ts
  - src/psk/exchange.ts
  - src/psk/index.ts
  - src/psk/psk.test.ts
  - src/psk/ratchet.ts
  - src/psk/state.ts
  - src/psk/types.ts
  - src/queue/SendQueue.test.ts
  - src/queue/SendQueue.ts
  - src/queue/SyncManager.ts
  - src/queue/file-send-queue-storage.ts
  - src/queue/index.ts
  - src/services/MessageIndexer.ts
  - src/services/algorand.service.test.ts
  - src/services/algorand.service.ts
  - src/services/index.ts
  - src/services/mnemonic.service.test.ts
  - src/services/mnemonic.service.ts
  - src/storage/encryption-key-storage.ts
  - src/storage/file-key-storage.errors.ts
  - src/storage/file-key-storage.ts
  - src/storage/index.ts
  - src/storage/message-cache.ts
  - src/storage/public-key-cache.ts

db_tables: []
depends_on: []
---

# TypeScript AlgoChat

## Purpose

Provides the TypeScript implementation of the AlgoChat encrypted-messaging protocol on Algorand. The package derives and exchanges encryption keys, encodes standard and pre-shared-key envelopes, submits and indexes note transactions, models conversations, and supplies durable queue, cache, and key-storage abstractions without concealing blockchain metadata.

## Public API

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
| `SIGNING_SCHEME` | Published protocol value, size boundary, preset, or search default. |
| `SigningScheme` | Typed protocol, configuration, or result contract defined by this module. |
| `ChatAccountOptions` | Typed protocol, configuration, or result contract defined by this module. |
| `FALCON_FEE_MULTIPLIER` | Published protocol value, size boundary, preset, or search default. |
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
| `NOTE_FEE_BASE_BYTES` | Note bytes covered by one minimum fee before the consensus surcharge. |
| `PaymentScheme` | Authorizing scheme (`ed25519` or `falcon-1024`) used to price a note payment. |
| `notePaymentFee` | Minimum payment fee for a note: scheme fee plus the consensus surcharge past 1024 bytes. |
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

## Invariants

1. Standard messages use a fresh ephemeral X25519 key and ChaCha20-Poly1305 authenticated encryption; decryption supports both recipient and sender key paths.
2. Binary decoders reject unsupported versions, protocols, truncated fields, malformed lengths, and unauthenticated ciphertext rather than returning partial content.
3. Key announcements are accepted only when their address, signing key, encryption key, and signature agree.
4. PSK mode combines ECDH material with a ratcheted PSK, derives a new position key per counter, and rejects replayed or unreasonably far-ahead counters.
5. A message transaction is a minimum-payment transfer whose note fits the Algorand 4096-byte limit. Standard plaintext is at most 3954 bytes and PSK plaintext is at most 3950 bytes. One byte past those maxima fails before a transaction is built. The fee is `notePaymentFee`: `minFee * 3` for Falcon-1024 and `minFee` otherwise, plus `(max(0, noteBytes - 1024) * minFee + 9999) / 10000` using integer division.
6. Indexed history is filtered to the participants, decoded defensively, de-duplicated, and returned in chronological order.
7. Queue transitions are explicit and retry counts are bounded; successful removal occurs only after delivery succeeds.
8. File-backed secrets and queue state use authenticated encryption or atomic replacement and never silently substitute corrupt persisted data.
9. Network clients remain injectable so protocol behavior can be verified without live Algorand mutation.
10. The package does not claim metadata privacy: account addresses, transaction timing, and on-chain activity remain observable.
11. Encryption keys are derived from 32-byte mnemonic entropy for every scheme. `createRandomChatAccount()` defaults to Falcon-1024 `pqsig`. `createChatAccountFromMnemonic` without a scheme recovers Ed25519. The same mnemonic yields identical X25519 keys and different addresses across schemes. Falcon payments use at least `minFee * FALCON_FEE_MULTIPLIER` (3), plus the note surcharge when the note exceeds 1024 bytes.
12. Encrypted envelopes are delivered only as Algorand payment notes signed through `ChatAccount.txnSigner`. The package does not include a raven mailbox router or other dead-drop transport.

## Behavioral Examples

```
Given a sender account, recipient encryption key, and plaintext
When AlgorandService sends a standard message
Then it encrypts an authenticated envelope, embeds it in a valid note transaction, submits it, and returns the transaction identifier
```

```
Given a PSK state that has already accepted a counter
When the same counter is received again
Then replay validation rejects it without advancing the receive state
```

```
Given queued messages and restored connectivity
When SyncManager starts synchronization
Then SendQueue processes eligible entries in order, records failures for retry, and removes only successful entries
```

## Error Cases

| Error | Condition | Behavior |
|---|---|---|
| `EncryptionError` / `EnvelopeError` | Invalid key material, ciphertext, version, protocol, or binary layout | Reject encryption/decryption or decoding with a typed error |
| `PSKEncryptionError` / `PSKEnvelopeError` | Invalid PSK, counter, authentication tag, or PSK envelope | Reject without emitting plaintext or changing replay state |
| `SignatureError` | Wrong Ed25519/X25519 key size or invalid announcement signature | Reject key publication or discovery |
| `MessageTooLargeError` | Encoded note exceeds 4096 bytes | Do not construct or submit the transaction |
| `PublicKeyNotFoundError` | No valid announcement is found within the configured search | Return an explicit discovery failure |
| Storage errors | Password absent, decryption fails, data is invalid, or key is missing | Preserve existing storage and report the distinct cause |
| `ChatError` | Public service or protocol operation fails | Preserve a stable `ChatErrorCode`, message, cause, and optional context |

## Dependencies

- `algosdk` ≥ 3.7.0 for Algorand accounts, `pqsig`, encoding, and clients.
- `falcon-1024` for deterministic Falcon-1024 keygen and compressed signatures.
- `@noble/curves`, `@noble/ciphers`, and `@noble/hashes` for X25519, Ed25519, ChaCha20-Poly1305, HKDF, and hashes.
- Bun for the deterministic TypeScript test suite and TypeScript for declaration/build validation.

## Change Log

| Version | Date | Changes |
|---|---|---|
| 1 | 2026-07-13 | Adopted SpecSync 5 and Trust 1 governance without a canonical product specification |
| 2 | 2026-07-14 | Added the stable full-library contract for the existing implementation and tests |
| 3 | 2026-07-14 | CHG-0002-replace-the-incomplete-no-spec-rationale-with-a-stable-full-library-algochat-con: Replace the incomplete no-spec rationale with a stable full-library AlgoChat contract covering every existing source, export, invariant, failure mode, and native test boundary |
| 2026-07-19 | CHG-0006-add-an-opt-in-mailboxroutertransport-speaking-the-raven-mailbox-protocol-per-co: Add an opt-in MailboxRouterTransport speaking the raven mailbox protocol: per-counter key derivation, MBR-exact put groups, atomic N-recipient fan-out, burn/reclaim/status, off-chain box reads, gated behind service config |
| 5 | 2026-08-27 | Default new ChatAccounts to Falcon-1024 `pqsig`; mnemonic import without a scheme stays Ed25519; encryption seed is mnemonic entropy; Falcon min fee is 3× |
| 5 | 2026-08-27 | CHG-0007-falcon-default-chataccounts: Default new ChatAccounts to Falcon-1024 pqsig while mnemonic import stays Ed25519 |
| 6 | 2026-09-20 | Remove the raven mailbox router. Delivery is encrypted payment notes only. Falcon-1024 `pqsig` remains the default authorizer for new accounts. |
| 7 | 2026-09-20 | remove-the-raven-mailbox-router-transport-and-keep-algochat-as-encrypted-note-messaging-with-falcon-1024-post-quantum: Remove the Raven mailbox router transport and keep AlgoChat as encrypted note messaging with Falcon-1024 post-quantum account support |
| 8 | 2026-10-16 | Raise the note ceiling to 4096 bytes (protocol 1.2.1). Standard plaintext max 3954, PSK plaintext max 3950. Fee is scheme fee plus the consensus surcharge past 1024 bytes. |
