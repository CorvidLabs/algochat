---
spec: algochat.spec.md
---

## Requirements

### REQ-algochat-001

The package SHALL derive X25519 keys and encrypt and decrypt version-one AlgoChat payloads with authenticated recipient and sender recovery.

Acceptance Criteria
- Reusing the same account seed derives the same X25519 key pair, while ephemeral encryption produces distinct ciphertext and nonce material.
- An 882-byte plaintext encrypts and encodes to 1024 bytes. Plaintext at `MaxPayloadSize` (3954 bytes) round-trips for the intended recipient and original sender and encodes to exactly 4096 bytes. One byte past `MaxPayloadSize` returns `ErrMessageTooLarge` before an envelope is produced. An unrelated private key or tampered authenticated data returns an error.
- Reply encryption serializes reply ID and preview context, truncating previews longer than 80 bytes to a 77-byte prefix plus an ellipsis.
- Key-publish JSON decrypts to no chat content, and ordinary or reply JSON decrypts to the documented `DecryptedContent` fields.

### REQ-algochat-002

The package SHALL sign and verify X25519 encryption public keys with Ed25519 and produce deterministic human-readable key fingerprints.

Acceptance Criteria
- A correctly signed encryption key verifies with its matching Ed25519 public key; a different signing key or encryption key does not verify.
- Invalid Ed25519 private-key, public-key, and signature lengths return explicit errors.
- Repeated `Fingerprint` or `KeyFingerprint` calls for the same key return four uppercase hexadecimal groups derived from the first eight SHA-256 bytes.

### REQ-algochat-003

Queue and in-memory storage primitives SHALL preserve their configured limits, state transitions, ordering, isolation, retry, missing-key, and expiry behavior.

Acceptance Criteria
- A send queue defaults non-positive capacity to 100 and non-positive retry limits to three, rejects enqueue at capacity, returns the first pending message, and records sending, sent, pending-retry, or terminal-failed transitions using retry count and maximum retries.
- Queue removal, sent/failed purges, failed retry, clear, counts, capacity, pending-state queries, and snapshots operate on the matching messages without exposing the backing slice.
- Message storage deduplicates by message ID per participant, orders by timestamp, filters by rounds strictly greater than the supplied round, and clears messages and sync rounds at global or participant scope.
- Private-key storage reports `ErrKeyNotFound` for an absent address, and public-key cache retrieval removes expired entries while invalidate, clear, and prune remove their selected entries.

### REQ-algochat-004

Repository governance SHALL build, vet, and race-test every Go package while preserving the Go 1.22 through 1.24 compatibility matrix and the independent unified Trust gate.

Acceptance Criteria
- `go build ./...`, `go vet ./...`, and `go test -v -race -count=1 ./...` complete successfully in the native verification lane.
- Pull requests and protected-main pushes changing Go sources, module files, canonical specs, SpecSync state, Trust policy inputs, Fledge configuration, or either governance workflow schedule the unchanged Go 1.22, 1.23, and 1.24 matrix.
- The Trust workflow runs on every pull request and protected-main push with full history, Go 1.25, and the immutable Trust 1.0.0 action commit.
- Verification does not represent unfinished high-level send, receive, key-discovery, or live-network orchestration as implemented.

## Constraints

- The module currently requires Go 1.25 or newer.
- The high-level AlgoChat client remains outside the implemented surface.

## Out of Scope

- Implementing send, receive, key discovery, or live Algorand network integration.

### REQ-algochat-005

The envelope codec SHALL encode and decode the standard version-one transaction-note layout without claiming a decode-time plaintext-size limit.

Acceptance Criteria
- Encoding writes version, protocol ID, sender key, ephemeral key, nonce, encrypted sender key, and ciphertext at the documented offsets, and decoding reconstructs those fields.
- Decoding rejects data shorter than two bytes, unsupported versions, unsupported protocol IDs, and data shorter than `HeaderSize + TagSize`.
- `IsChatMessage` returns true exactly when at least two bytes contain the supported version and standard protocol ID.

### REQ-algochat-006

Conversation models SHALL maintain a synchronized, deduplicated, chronological view of messages and expose deterministic queries without returning the backing message slice.

Acceptance Criteria
- Append and merge ignore duplicate message IDs and sort newly accepted messages by timestamp.
- Last-message and direction-specific queries return the expected message or nil, and round/direction filters, lookup, count, highest-round, and clear reflect current content.
- Send option constructors progressively enable confirmation and indexer waiting while retaining the default ten-round and 30-second timeouts.

### REQ-algochat-007

Account constructors and blockchain boundary types SHALL expose the existing synchronous Algod and Indexer contracts without performing network orchestration.

Acceptance Criteria
- Constructing from a seed preserves the supplied address and Ed25519 public key and stores the deterministically derived X25519 key pair.
- Constructing from a 64-byte secret key uses bytes 0 through 31 as the seed and bytes 32 through 63 as the Ed25519 public key and produces the same account as direct seed construction.
- Algod and Indexer interfaces remain dependency boundaries only; no high-level client implementation is claimed.

### REQ-algochat-008

The package SHALL price an allowed note as one minimum fee plus the consensus surcharge, and SHALL reject a note larger than `MaxNoteSize` before returning a fee.

Acceptance Criteria
- `PaymentFee` at minFee 1000 returns 1000 for 1024 bytes, 1098 for 2000 bytes, and 1308 for 4096 bytes.
- A negative length or 4097 bytes returns `ErrNoteTooLarge`.
- The scheme component is one minimum fee. This package does not provide a Falcon signer.
