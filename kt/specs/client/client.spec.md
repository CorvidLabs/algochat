---
module: client
version: 1.0.1
status: active
files:
  - src/main/kotlin/com/corvidlabs/algochat/AlgoChat.kt
  - src/main/kotlin/com/corvidlabs/algochat/Blockchain.kt
  - src/main/kotlin/com/corvidlabs/algochat/Models.kt
  - src/main/kotlin/com/corvidlabs/algochat/Queue.kt
  - src/main/kotlin/com/corvidlabs/algochat/Storage.kt
db_tables: []
depends_on:
  - protocol
---

# Client

## Purpose

Provide the coroutine-based Kotlin client, Algorand transport abstractions, conversation models, retry queue, and storage contracts used to publish keys, encrypt messages, discover peers, and maintain local conversation state.

## Public API

### Client and network configuration

| Export | Description |
|---|---|
| `AlgoChatConfig` | Selects an `AlgorandConfig` and cache/discovery behavior; includes localnet, testnet, and mainnet factories. |
| `AlgoChatClient` | Creates an identity from a seed and exposes conversation, key discovery, encryption, decryption, send, fetch, and queue operations. |
| `AlgorandConfig` | Holds algod/indexer endpoints and tokens, with network factories and `withIndexer`. |
| `AlgodClient` / `IndexerClient` | Suspend-only transport interfaces for chain state, submission, confirmation, and note-transaction searches. |
| `TransactionInfo`, `NoteTransaction`, `SuggestedParams`, `AccountInfo` | Typed blockchain responses consumed by the client. |
| `discoverEncryptionKey` | Finds the newest valid key announcement and records signature verification metadata. |

### Conversation and delivery models

| Export | Description |
|---|---|
| `Message`, `MessageDirection`, `ReplyContext` | Immutable received/sent message data and reply preview metadata. |
| `Conversation` | Deduplicates messages by transaction id, orders them by round and intra-round offset, and exposes directional queries. |
| `DiscoveredKey` | Public-key bytes plus verification and chain-discovery provenance. |
| `SendOptions`, `SendResult` | Confirmation, indexer, reply, and amount controls plus the resulting transaction/message. |
| `PendingMessage`, `PendingStatus`, `QueueConfig`, `SendQueue` | Retryable queued delivery with bounded capacity, state transitions, retry delay, and pruning. |

### Storage

| Export | Description |
|---|---|
| `Storage`, `InMemoryStorage` | Suspendable byte storage contract and deterministic in-memory implementation. |
| `ConversationStore`, `PublicKeyCache` | Typed persistence for messages, fetch rounds, discovered keys, and verified-key lookups. |

### Complete export index

| Export | Contract role |
|---|---|
| `AlgoChatConfig` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `network` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `autoDiscoverKeys` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `cachePublicKeys` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `cacheMessages` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `AlgoChatClient` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `address` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `AlgorandConfig` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `algodUrl` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `algodToken` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `indexerUrl` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `indexerToken` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `TransactionInfo` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `txid` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `confirmedRound` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `NoteTransaction` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `sender` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `receiver` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `note` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `roundTime` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `SuggestedParams` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `fee` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `minFee` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `firstValid` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `lastValid` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `genesisId` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `genesisHash` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `AccountInfo` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `amount` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `minBalance` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `AlgodClient` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `getSuggestedParams` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `getAccountInfo` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `submitTransaction` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `waitForConfirmation` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `getCurrentRound` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `IndexerClient` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `searchTransactions` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `searchTransactionsBetween` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `getTransaction` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `waitForIndexer` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `discoverEncryptionKey` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `ReplyContext` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `messageId` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `preview` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `MessageDirection` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `Message` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `id` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `recipient` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `content` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `timestamp` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `direction` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `replyContext` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `intraRoundOffset` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `Conversation` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `participant` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `participantEncryptionKey` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `DiscoveredKey` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `publicKey` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `isVerified` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `discoveredInTx` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `discoveredAtRound` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `discoveredAt` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `SendOptions` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `timeoutRounds` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `indexerTimeoutSecs` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `customAmount` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `SendResult` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `message` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `PendingStatus` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `PendingMessage` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `createdAt` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `retryCount` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `lastAttempt` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `status` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `lastError` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `QueueConfig` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `maxRetries` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `retryDelay` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `maxQueueSize` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `SendQueue` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `MessageCache` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `store` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `retrieve` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `getLastSyncRound` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `setLastSyncRound` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `getCachedConversations` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `clear` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `clearFor` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `InMemoryMessageCache` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `key` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `verified` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `expiresAt` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `CachedKey` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `PublicKeyCache` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `EncryptionKeyStorage` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `hasKey` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `delete` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `listStoredAddresses` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `InMemoryKeyStorage` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |
| `FileKeyStorage` | Existing client symbol; its behavior and invariants are defined by the owning API group below. |

SpecSync's Kotlin member parser additionally exposes the following constructor properties and callable members. They retain the semantics of their owning types described above:

`AlgoChatConfig`, `network`, `autoDiscoverKeys`, `cachePublicKeys`, `cacheMessages`, `AlgoChatClient`, `address`, `AlgorandConfig`, `algodUrl`, `algodToken`, `indexerUrl`, `indexerToken`, `TransactionInfo`, `txid`, `confirmedRound`, `NoteTransaction`, `sender`, `receiver`, `note`, `roundTime`, `SuggestedParams`, `fee`, `minFee`, `firstValid`, `lastValid`, `genesisId`, `genesisHash`, `AccountInfo`, `amount`, `minBalance`, `AlgodClient`, `getSuggestedParams`, `getAccountInfo`, `submitTransaction`, `waitForConfirmation`, `getCurrentRound`, `IndexerClient`, `searchTransactions`, `searchTransactionsBetween`, `getTransaction`, `waitForIndexer`, `discoverEncryptionKey`, `ReplyContext`, `messageId`, `preview`, `MessageDirection`, `Message`, `id`, `recipient`, `content`, `timestamp`, `direction`, `replyContext`, `intraRoundOffset`, `Conversation`, `participant`, `participantEncryptionKey`, `DiscoveredKey`, `publicKey`, `isVerified`, `discoveredInTx`, `discoveredAtRound`, `discoveredAt`, `SendOptions`, `timeoutRounds`, `indexerTimeoutSecs`, `customAmount`, `SendResult`, `message`, `PendingStatus`, `PendingMessage`, `createdAt`, `retryCount`, `lastAttempt`, `status`, `lastError`, `QueueConfig`, `maxRetries`, `retryDelay`, `maxQueueSize`, `SendQueue`, `MessageCache`, `store`, `retrieve`, `getLastSyncRound`, `setLastSyncRound`, `getCachedConversations`, `clear`, `clearFor`, `InMemoryMessageCache`, `key`, `verified`, `expiresAt`, `CachedKey`, `PublicKeyCache`, `EncryptionKeyStorage`, `hasKey`, `delete`, `listStoredAddresses`, `InMemoryKeyStorage`, and `FileKeyStorage`.

## Invariants

1. An `AlgoChatClient` derives its X25519 and Ed25519 identity from the supplied seed and exposes the corresponding Algorand address.
2. Conversation merge never duplicates a transaction id and keeps messages ordered by confirmed round then intra-round offset.
3. A discovered key is marked verified only when its announcement carries a valid signature for the announcing Algorand address.
4. Queue size never exceeds `maxQueueSize`; state transitions update retry metadata consistently and retry selection respects `retryDelay` and `maxRetries`.
5. Storage implementations isolate caller-owned byte arrays from stored state, and typed stores use stable namespaced keys.

## Behavioral Examples

```text
Given a seeded client and an indexer containing a signed public-key announcement
When discoverKey is called for the announcing address
Then the newest key is returned with isVerified true and may be cached

Given a conversation that already contains transaction A
When a fetched batch containing A and a later transaction B is merged
Then A remains singular and B follows it in deterministic chain order
```

## Error Cases

| Error | When | Behavior |
|---|---|---|
| `AlgoChatException.InvalidKey` | Key bytes or an Algorand address are malformed. | Reject the operation before cryptographic use. |
| `AlgoChatException.KeyNotFound` | No usable recipient key can be discovered. | Return the documented missing-key failure instead of sending plaintext. |
| `AlgoChatException.BlockchainError` | Transport, submission, confirmation, or indexing fails. | Preserve the cause and fail the suspend operation. |
| `IllegalStateException` | A queue is full or an invalid required delivery state is encountered. | Leave unrelated queued messages intact. |

## Dependencies

- Kotlin coroutines for mutex-protected state and suspend contracts.
- Algorand Java SDK model/address primitives.
- The `protocol` spec for envelopes, keys, signatures, and payload encoding.

## Change Log

| Version | Date | Changes |
|---|---|---|
| 1.0.0 | 2026-07-14 | Canonically document the existing client, blockchain, model, queue, and storage behavior. |
| 2026-07-14 | CHG-0002-run-the-existing-jdk-17-and-21-ci-matrix-when-trust-and-specsync-governance-file: Complete Kotlin AlgoChat SDD adoption and run the native CI matrix |

## SDD Adoption

The client contract was established from the existing production sources and `AlgoChatClientTest`, `AlgoChatTest`, `BlockchainTest`, `ModelsTest`, `QueueTest`, and `StorageTest`. Adoption changes governance only; it does not change client behavior.

