---
spec: psk.spec.md
---

## User Stories

- As two peers with an out-of-band secret, we can require both that secret and our asymmetric identities to decrypt messages.
- As an application developer, I can reject replayed or implausibly advanced counters without corrupting receive state.

## Acceptance Criteria

1. **REQ-psk-001**: The protocol-id-2 envelope preserves counter and every fixed-width field and rejects malformed headers; `PSKTest` covers encoding, decoding, and recognition.
2. **REQ-psk-002**: Ratchet derivation matches the committed known-answer boundaries and domain separation; `PSKTest` covers session, position, hybrid, and sender-key vectors.
3. **REQ-psk-003**: Send counters advance atomically, receive counters enforce replay/window rules, and failed receive blocks do not commit state; `PSKTest` covers boundaries, reset, replay, and rollback.
4. **REQ-psk-004**: Sender and recipient round-trip hybrid ciphertext only with the matching PSK and identities; `PSKTest` covers success, wrong PSK, wrong key, and tampering.
5. **REQ-psk-005**: Exchange URIs round-trip address, 32-byte PSK, and optional label while rejecting bad schemes, missing fields, and invalid key lengths; `PSKTest` covers those cases.
6. **REQ-psk-006**: The PSK header stays 130 bytes and the tag stays 16 bytes. A 878-byte plaintext still encrypts into at most 1024 bytes. A 3950-byte plaintext encodes to exactly 4096 bytes. One extra byte fails before a transaction is built. `PSKTest` covers these cases.

## Constraints

- PSKs are exactly 32 bytes and must be exchanged outside the blockchain message channel.
- Counter replay/window decisions are security state and must be atomic with successful decryption.

## Out of Scope

- Human trust establishment and secure presentation of exchange URIs.
- Persistent PSK-state storage and multi-device counter reconciliation.

### REQ-psk-001

The protocol-id-2 envelope codec SHALL preserve its counter and every fixed-width cryptographic field while rejecting malformed headers.

Acceptance Criteria
- Existing PSK envelope round-trip, recognition, and invalid-header cases pass in `PSKTest`.

### REQ-psk-002

The PSK ratchet SHALL deterministically domain-separate session, position, hybrid, and sender-wrapping derivations.

Acceptance Criteria
- Existing known-answer and boundary derivation cases pass in `PSKTest`.

### REQ-psk-003

PSK state SHALL advance sends atomically, reject replays and out-of-window receives, and commit receive counters only after decryption succeeds.

Acceptance Criteria
- Existing counter, replay, window, rollback, and reset cases pass in `PSKTest`.

### REQ-psk-004

Hybrid encryption SHALL require both the matching 32-byte PSK and the intended X25519 identity to authenticate plaintext.

Acceptance Criteria
- Existing sender/recipient, wrong-PSK, wrong-key, and tampering cases pass in `PSKTest`.

### REQ-psk-005

PSK exchange URIs SHALL round-trip address, exact 32-byte PSK, and optional label while rejecting invalid schemes or parameters.

Acceptance Criteria
- Existing exchange encode/decode and invalid-input cases pass in `PSKTest`.

### REQ-psk-006

PSK plaintext of 878 bytes SHALL still encrypt into a note of at most 1024 bytes. Plaintext of 3950 bytes SHALL encode to exactly 4096 bytes, and one extra byte SHALL fail before a transaction is built. The header stays 130 bytes and the tag stays 16 bytes.

Acceptance Criteria
- `PSKTest` accepts an 878-byte plaintext at 1024 bytes or fewer, encodes the 3950-byte maximum to exactly 4096 bytes, and rejects one extra byte.

