---
spec: algochat.spec.md
---

## User Stories

- As an application developer, I want interoperable encrypted Algorand messaging with typed failures and deterministic local verification.
- As a user, I want message content protected while receiving honest disclosure that blockchain metadata remains public.

## Acceptance Criteria

### REQ-algochat-001

Standard encryption SHALL derive fresh ephemeral X25519 material and authenticate every plaintext with ChaCha20-Poly1305.

Acceptance Criteria
- Round-trip, wrong-key, tampering, empty-message, Unicode, and reply-context tests exercise `encryptMessage`, `encryptReply`, and `decryptMessage`.

### REQ-algochat-002

Standard envelope encoding SHALL be deterministic and SHALL reject invalid version, protocol, length, or truncated input.

Acceptance Criteria
- `encodeEnvelope`, `decodeEnvelope`, and `isChatMessage` tests cover valid and malformed binary data.

### REQ-algochat-003

Encryption-key announcements MAY bind an Ed25519 signing identity to an X25519 public key with Ed25519 signatures. Falcon-1024 senders bind identity through the payment `pqsig` instead.

Acceptance Criteria
- Signature round trips pass and wrong messages, wrong keys, mutations, and invalid key sizes fail for the Ed25519 helper.
- Falcon ChatAccounts still publish and discover X25519 keys via the existing envelope `sender_pubkey` path.

### REQ-algochat-004

Key discovery SHALL scan configured indexer results, validate announcements, and return the newest valid key without accepting malformed or forged notes.

Acceptance Criteria
- Discovery tests cover direct parsing, paginated search, invalid signatures, malformed notes, and no-key results.

### REQ-algochat-005

Message transactions SHALL use the protocol minimum payment, encode the encrypted envelope as a note, and reject notes larger than `MAX_NOTE_SIZE` (4096 bytes) before submission.

Acceptance Criteria
- Transaction construction exposes `MINIMUM_PAYMENT`, enforces 4096 bytes, and preserves signed and unsigned transaction types.
- Standard plaintext of 882 bytes and PSK plaintext of 878 bytes still encrypt. Standard plaintext of 3954 bytes and PSK plaintext of 3950 bytes encode to a note of exactly 4096 bytes. One byte past either maximum fails before a transaction is built.
- Payment fee is `notePaymentFee`: scheme fee plus surcharge. Scheme fee is `minFee * 3` for Falcon-1024 and `minFee` otherwise. Surcharge is `(max(0, noteBytes - 1024) * minFee + 9999) / 10000` using integer division. At minFee 1000 the vectors are 1024 to 1000, 1025 to 1001, 2000 to 1098, 4096 to 1308, and Falcon 4096 to 3308. Notes of 1024 bytes or fewer stay at 1000 or 3000.

### REQ-algochat-006

PSK encryption SHALL combine ephemeral ECDH material with the counter-derived PSK so neither input alone produces the message key.

Acceptance Criteria
- PSK tests cover successful round trips, wrong PSK, wrong recipient key, tampering, and sender-side decryption.

### REQ-algochat-007

The PSK ratchet SHALL derive deterministic session and position keys, with a new session every 100 counters.

Acceptance Criteria
- Boundary tests distinguish positions and sessions and verify `derivePSKAtCounter` against explicit session/position derivation.

### REQ-algochat-008

PSK receive state SHALL reject replays and counters outside its accepted forward window, while send counters advance exactly once per message. Legal counters are integers from 0 through 4294967295. The send counter at 4294967295 is issued once and then the state is exhausted; the stored next counter does not become 0.

Acceptance Criteria
- State tests cover first receive, out-of-order accepted counters, duplicates, excessive gaps, and immutable send advancement.
- A fresh state accepts unseen counters 0 through 200 and rejects 1000000, negatives, and fractional values. Those inputs are rejected before 4-byte encoding and are not encoded as counter 0.
- After highest accepted N, unseen counters from max(0, N-200) through min(4294967295, N+200) are accepted in any order. Accepting 4294967295 does not make counter 0 acceptable.
- Advancing at 4294967295 returns that counter, sets exhaustion, and leaves the stored counter at 4294967295. A later advance throws and does not change that state.
- Failed authentication does not record a counter. A later valid message with that counter still succeeds.
- The package does not persist PSK state. Callers that restart must store `sendExhausted`; these rules are tested on the pure state functions.

### REQ-algochat-009

PSK envelopes and exchange URIs SHALL round-trip all required fields and SHALL reject malformed, unsupported, or unsafe inputs.

Acceptance Criteria
- Binary envelope and `algochat-psk://v1` URI tests cover valid labels, encoding, malformed keys, versions, protocols, counters, and lengths.
- Standard and PSK note-facing decode, and PQ open, reject input longer than 4096 bytes before returning plaintext, including an authenticated oversized PQ note. Outbound plaintext one byte past the maximum still fails before a note is built.

### REQ-algochat-010

`AlgorandService` SHALL compose account creation, key discovery, message encryption, submission, fetching, and reply behavior through injectable clients.

Acceptance Criteria
- Service tests use deterministic mocks to verify send, reply, discovery, fetch, and failure propagation without live network mutation.

### REQ-algochat-024

New ChatAccounts SHALL default to Falcon-1024 authorization. Importing a mnemonic without a scheme SHALL recover the Ed25519 account. Encryption keys SHALL be derived from 32-byte mnemonic entropy for both schemes.

Acceptance Criteria
- `createRandomChatAccount()` returns `scheme: 'falcon-1024'` and a working `txnSigner`.
- `createChatAccountFromMnemonic(mn)` returns `scheme: 'ed25519'` and the classical address.
- `createChatAccountFromMnemonic(mn, { scheme: 'falcon-1024' })` recovers the Falcon address from a Falcon-generated mnemonic.
- The same mnemonic yields identical X25519 keys and different addresses across schemes.
- Falcon payments use at least `minFee * 3`, plus the note surcharge when the note is longer than 1024 bytes.

### REQ-algochat-025

The package SHALL deliver encrypted envelopes only as Algorand payment notes and SHALL NOT expose a raven mailbox router transport.

Acceptance Criteria
- Public exports omit `MailboxRouterTransport`, mailbox derivation helpers, mailbox errors, and mailbox constants.
- `AlgorandService` has no `mailboxAppId` configuration and no `mailbox` property.
- `src/blockchain/mailbox.ts` and `src/services/mailbox-router.service.ts` are absent.
- Send tests submit encrypted payment notes signed through `ChatAccount.txnSigner`.

### REQ-algochat-011

Mnemonic and address helpers SHALL validate Algorand inputs and SHALL round-trip encryption public keys through base64.

Acceptance Criteria
- Tests cover valid and invalid mnemonics/addresses, random and restored accounts, and base64 conversions.

### REQ-algochat-012

Indexed message retrieval SHALL paginate, filter participants, decrypt supported notes, ignore unrelated or malformed notes, de-duplicate transactions, and sort by confirmed round ascending, then intra-round offset ascending. A missing offset sorts as 0. Timestamp and insertion order do not override that key.

Acceptance Criteria
- Indexer tests cover multiple pages, participant directions, malformed notes, duplicates, pagination limits, and conversation assembly.
- Equal timestamps inserted newest-first come out in intra-round offset order for the exported indexer, the abstract indexer, and `Conversation`.
- A pagination boundary item is not skipped or duplicated. `AlgorandService` fetch order stays timestamp, then intra-round offset on a tie.

### REQ-algochat-013

Conversation models SHALL retain participant identity and ordered messages and SHALL derive the latest message from chain order.

Acceptance Criteria
- Conversation tests cover construction, chain order, duplicate handling, and last-message updates.
- Newest-first insertion of equal timestamps does not beat intra-round offset. A missing offset sorts as 0. A shared boundary round is not skipped or duplicated by `messagesAfterRound`.

### REQ-algochat-014

Pending-message helpers SHALL return immutable state transitions and enforce the configured retry ceiling.

Acceptance Criteria
- Creation, sending, failure, success, retry-count, and `canRetry` behavior are deterministic.

### REQ-algochat-015

`SendQueue` SHALL persist queued work, process eligible messages in order, emit lifecycle events, and retain failed items for bounded retry.

Acceptance Criteria
- Queue tests cover enqueue, ordering, concurrency exclusion, retries, events, cancellation, restoration, and successful removal.

### REQ-algochat-016

`SyncManager` SHALL expose idle, syncing, and offline states and SHALL coordinate queue processing with connectivity and periodic synchronization.

Acceptance Criteria
- The native build type-checks the public state/events/configuration contract and queue integration.

### REQ-algochat-017

In-memory and file-backed caches SHALL support bounded lookup, update, deletion, and clearing without changing caller-owned message values.

Acceptance Criteria
- Cache tests cover capacity behavior, replacement, lookup, removal, and clearing.

### REQ-algochat-018

File-backed key storage SHALL require a password where configured, authenticate encrypted data, replace files atomically, and distinguish missing, invalid, and undecryptable data.

Acceptance Criteria
- The native suite exercises storage round trips and typed `KeyNotFoundError`, `PasswordRequiredError`, `DecryptionFailedError`, and `InvalidKeyDataError` paths.

### REQ-algochat-019

Public errors SHALL preserve stable machine-readable `ChatErrorCode` classification while retaining contextual human-readable cause information.

Acceptance Criteria
- `isChatError` narrows package errors and `wrapError` preserves existing errors or wraps unknown failures with context.

### REQ-algochat-020

The package SHALL disclose that encryption protects content but not public addresses, timing, or transaction activity.

Acceptance Criteria
- The canonical specification and README security table both state the metadata and traffic-analysis limitation.

## Implementation status

The standard/PSK writers use header-authenticated envelope version `0x02`, while legacy version `0x01` remains readable. The high-level service/indexers handle standard protocol `0x01`; ratcheting PSK and hybrid sessions are low-level operations. Replay helpers require callers to validate, record after authentication and preserve state, including `sendExhausted`. This package does not persist PSK counters. `FileKeyStorage` and `FileSendQueueStorage` are source-only; `package.json` does not export them or a `/node` subpath. These facts qualify coverage claims rather than changing accepted SHALL requirements; see [implementation gaps](../../../docs/ACCURACY.md).

## Constraints

- Protocol bytes must remain compatible with AlgoChat v1.0 and its PSK v1.1 extension.
- Verification must not require credentials, live wallets, or mutation of public networks.

## Out of Scope

- Hiding Algorand transaction metadata, operating an indexer, wallet custody, automatic out-of-band PSK exchange, and raven mailbox / dead-drop routing.

### REQ-algochat-026

The TypeScript package SHALL draft and reduce protocol 0x03 room administration records and SHALL seal and open 0x06 action 5 key deliveries as PROTOCOL.md section 5.8 and vectors/group-admin-v1.json specify. A legacy group-v1 membership note SHALL still open and SHALL NOT create an owner.

Acceptance Criteria
- ts/src/pq/group-admin.test.ts matches vectors/group-admin-v1.json for REQ-algochat-026.
- src/pq/group.test.ts still opens vectors/group-v1.json.

### REQ-algochat-027

The TypeScript package SHALL draft delta protocol 0x03 notes that record one added or removed person and omit the member list. It SHALL still open a full-list note. A full-list note of 256 members SHALL be rejected as too large. `GROUP_MEMBER_MAX` SHALL be 256. A channel SHALL be a room with its own mailbox and key whose notes name the parent room. The group owner creates and owns that channel. Parent membership SHALL NOT copy people into the channel. Key deliveries SHALL be separate payments of at most 16, and a landed payment SHALL stay landed so a missed recipient can be resumed.

Acceptance Criteria
- ts/src/pq/group-admin.test.ts folds a delta room from 1 member to 256 and rejects a 256-member full list.
- ts/src/pq/group-admin.test.ts matches vectors/group-admin-delta-v1.json.
- A channel reduced with its parent history does not contain a parent member who was never added.
- ts/scripts/room-scale-localnet.ts is the LocalNet driver. It is not part of `bun test`.

