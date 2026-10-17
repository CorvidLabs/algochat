## ADDED
### SPEC SECTION SDD Adoption

The interoperability contract was established from the existing `CrossImplTest` producer-specific decrypt and Kotlin export cases. Adoption changes governance only; it does not change fixture or production protocol behavior.

### REQUIREMENT REQ-cross-vectors-001
The Kotlin implementation SHALL authenticate and decrypt the Swift-produced envelopes to their declared plaintext.

Acceptance Criteria
- `decrypt Swift envelopes` passes in `CrossImplTest`.

### REQUIREMENT REQ-cross-vectors-002
The Kotlin implementation SHALL authenticate and decrypt the TypeScript- and Python-produced envelopes to their declared plaintext.

Acceptance Criteria
- `decrypt TypeScript envelopes` and `decrypt Python envelopes` pass in `CrossImplTest`.

### REQUIREMENT REQ-cross-vectors-003
The Kotlin implementation SHALL authenticate and decrypt the Rust- and Kotlin-produced envelopes to their declared plaintext.

Acceptance Criteria
- `decrypt Rust envelopes` and `decrypt Kotlin envelopes` pass in `CrossImplTest`.

### REQUIREMENT REQ-cross-vectors-004
The Kotlin test harness SHALL export production-generated envelopes in the shared cross-implementation fixture shape.

Acceptance Criteria
- `export envelopes for cross-implementation testing` passes in `CrossImplTest`.
