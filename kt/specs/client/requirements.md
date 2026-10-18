---
spec: client.spec.md
---

## User Stories

- As an application developer, I can create an AlgoChat identity from a seed and exchange encrypted Algorand note messages without implementing protocol cryptography.
- As an application developer, I can persist conversations, cache verified keys, and retry delivery through suspendable interfaces.

## Acceptance Criteria

1. **REQ-client-001**: Seed construction deterministically derives the client's encryption identity and Algorand address; `AlgoChatClientTest` and `AlgoChatTest` exercise construction and round trips. Falcon derivation does not keep the raw entropy in process-global state.
2. **REQ-client-002**: Key discovery parses announcements and distinguishes signed verified keys from unverified keys. An ACPQ note is not an X25519 key. `BlockchainTest` and `PQTest` cover address decoding, announcement discovery, and that rejection.
3. **REQ-client-003**: Conversations deduplicate by transaction id and maintain round/offset order; `ModelsTest` covers append, merge, filtering, and reply contexts. `AlgoChatClientTest` covers sync of reversed same-round notes.
4. **REQ-client-004**: The send queue enforces capacity, transition, retry, pruning, and recipient-query rules; `QueueTest` covers each queue state path.
5. **REQ-client-005**: Storage and typed stores preserve bytes, namespaces, messages, rounds, and key verification metadata; `StorageTest` covers those persistence contracts.

## Constraints

- Blockchain operations are suspend functions; callers supply concrete algod and indexer clients.
- The library does not persist private signing or encryption keys through the public storage helpers.

## Out of Scope

- Concrete HTTP algod/indexer implementations and user-interface presentation.
- Wallet custody, transaction signing UX, and application database selection.

### REQ-client-001

The client SHALL derive its encryption identity and Algorand address deterministically from the supplied seed. Falcon derivation SHALL NOT retain the raw mnemonic entropy in process-global state.

Acceptance Criteria
- Existing seeded construction and encryption round-trip cases pass in `AlgoChatClientTest` and `AlgoChatTest`.
- After a Falcon derivation, clearing the caller's seed leaves no global raw-entropy key. `AlgoChatClientTest` covers that case.

### REQ-client-002

Key discovery SHALL parse announcements and preserve whether the announcing Algorand identity verified the key signature. A note that starts with ACPQ SHALL NOT be returned as an X25519 key.

Acceptance Criteria
- Existing address, signature, and discovery cases pass in `BlockchainTest`.

### REQ-client-003

Conversation state SHALL deduplicate transaction identifiers and retain deterministic round and intra-round ordering. Syncing an indexed note SHALL keep that note's intra-round offset.

Acceptance Criteria
- Existing append, merge, filter, ordering, and reply-context cases pass in `ModelsTest`.
- Reversed same-round notes sync into offset order in `AlgoChatClientTest`.

### REQ-client-004

The send queue SHALL enforce its capacity, retry timing, retry limit, state transitions, pruning, and recipient queries.

Acceptance Criteria
- Existing queue lifecycle and boundary cases pass in `QueueTest`.

### REQ-client-005

Storage implementations SHALL preserve namespaced messages, sync rounds, keys, verification metadata, and caller byte-array isolation.

Acceptance Criteria
- Existing persistence, cache, and key-storage cases pass in `StorageTest`.

## Implementation gap status

`REQ-client-001` and `REQ-client-003` are met for address matching and chain order. Private-key persistence remains normative and unmet: source persists encryption keys through `EncryptionKeyStorage`. See the [accuracy ledger](../../../docs/ACCURACY.md).
