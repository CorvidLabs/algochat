## ADDED
### SPEC SECTION SDD Adoption

The PSK contract was established from the existing production sources and the known-answer, state, envelope, hybrid-encryption, and exchange cases in `PSKTest`. Adoption changes governance only; it does not change ratchet or envelope behavior.

### REQUIREMENT REQ-psk-001
The protocol-id-2 envelope codec SHALL preserve its counter and every fixed-width cryptographic field while rejecting malformed headers.

Acceptance Criteria
- Existing PSK envelope round-trip, recognition, and invalid-header cases pass in `PSKTest`.

### REQUIREMENT REQ-psk-002
The PSK ratchet SHALL deterministically domain-separate session, position, hybrid, and sender-wrapping derivations.

Acceptance Criteria
- Existing known-answer and boundary derivation cases pass in `PSKTest`.

### REQUIREMENT REQ-psk-003
PSK state SHALL advance sends atomically, reject replays and out-of-window receives, and commit receive counters only after decryption succeeds.

Acceptance Criteria
- Existing counter, replay, window, rollback, and reset cases pass in `PSKTest`.

### REQUIREMENT REQ-psk-004
Hybrid encryption SHALL require both the matching 32-byte PSK and the intended X25519 identity to authenticate plaintext.

Acceptance Criteria
- Existing sender/recipient, wrong-PSK, wrong-key, and tampering cases pass in `PSKTest`.

### REQUIREMENT REQ-psk-005
PSK exchange URIs SHALL round-trip address, exact 32-byte PSK, and optional label while rejecting invalid schemes or parameters.

Acceptance Criteria
- Existing exchange encode/decode and invalid-input cases pass in `PSKTest`.
