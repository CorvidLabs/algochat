## MODIFIED

### SPEC SECTION Invariants

1. Encryption derives and exchanges X25519 keys and authenticates ciphertext with ChaCha20-Poly1305 according to the existing version-one envelope format.
2. Decoding rejects unsupported versions, protocols, undersized envelopes, and oversized plaintext without returning an apparent success.
3. Queue and in-memory storage operations preserve ordering, retry limits, deduplication, participant isolation, and explicit missing-key behavior.
4. Signing and verification use the expected Ed25519 key and signature sizes and reject mismatches.
5. This migration does not claim the unfinished high-level send/receive client is implemented.

### REQUIREMENT REQ-algochat-001

The package SHALL derive keys and encrypt, encode, decode, and decrypt version-one AlgoChat envelopes with authenticated failure behavior.

Acceptance Criteria
- A supported version-one envelope round-trips its original plaintext for the intended recipient.
- A wrong recipient key, tampered ciphertext, unsupported version, or oversized message returns an error.

### REQUIREMENT REQ-algochat-002

The package SHALL sign and verify encryption-key announcements and produce deterministic key fingerprints.

Acceptance Criteria
- A valid announcement verifies with its signing key, while a mismatched key or signature is rejected.
- Repeated fingerprinting of the same key produces the same value.

### REQUIREMENT REQ-algochat-003

Queue and storage primitives SHALL preserve their documented limits, transitions, ordering, isolation, retry, and missing-key behavior.

Acceptance Criteria
- Queue tests cover FIFO order, retry limits, deduplication, and terminal failure transitions.
- Storage tests cover participant isolation and explicit missing-key results.

### REQUIREMENT REQ-algochat-004

Native verification SHALL build, vet, and race-test every Go package without asserting that the unfinished high-level client exists.

Acceptance Criteria
- `go build ./...`, `go vet ./...`, and `go test -race ./...` complete successfully.
- The verification lane does not represent unfinished client send/receive behavior as implemented.
