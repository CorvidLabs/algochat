## ADDED
### SPEC SECTION SDD Adoption

The base protocol contract was established from the existing production sources and envelope, payload, signature, cryptography, and cross-implementation tests. Adoption changes governance only; it does not change wire bytes or cryptographic behavior.

### REQUIREMENT REQ-protocol-001
The v1 envelope codec SHALL preserve every fixed-width field and reject short or unsupported headers.

Acceptance Criteria
- Existing round-trip, recognition, equality, short-input, and header-version cases pass in `EnvelopeTest`.

### REQUIREMENT REQ-protocol-002
Key operations SHALL derive deterministic seed identities, fresh ephemeral identities, matching X25519 secrets, and reversible public-key bytes.

Acceptance Criteria
- Existing key and interoperability cases pass in `AlgoChatTest` and `CrossImplTest`.

### REQUIREMENT REQ-protocol-003
Authenticated encryption SHALL decrypt for the intended sender and recipient and reject unrelated identities or modified ciphertext.

Acceptance Criteria
- Existing sender, recipient, wrong-key, and tampering cases pass in `AlgoChatTest` and `CrossImplTest`.

### REQUIREMENT REQ-protocol-004
Message payload decoding SHALL round-trip structured replies and retain backward-compatible UTF-8 plaintext decoding.

Acceptance Criteria
- Existing JSON, reply, legacy, malformed-JSON, and key-publish cases pass in `MessagePayloadTest`.

### REQUIREMENT REQ-protocol-005
Encryption-key signatures SHALL verify only for the correct key and Ed25519 signer, and fingerprints SHALL be deterministic SHA-256 hexadecimal.

Acceptance Criteria
- Existing valid, invalid, wrong-key, and fingerprint cases pass in `SignatureTest`.
