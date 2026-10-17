---
change: CHG-0002-run-the-existing-jdk-17-and-21-ci-matrix-when-trust-and-specsync-governance-file
artifact: testing
---

# Testing

- Run strict SpecSync validation without the hash cache and require 100 percent coverage.
- Confirm all four canonical specs and every stable requirement are represented by existing tests.
- Scan committed specs for TODOs, placeholders, fake values, and unresolved template prose.
- Run the native test, build, and JAR lane with isolated Temurin 17.
- Run the full Trust gate.
- Require hosted `Test (JDK 17)` and `Test (JDK 21)` jobs to pass.

## Requirement Evidence

- `REQ-client-001`, `REQ-client-002`, `REQ-client-003`, `REQ-client-004`, and `REQ-client-005`: `AlgoChatClientTest.kt`, `AlgoChatTest.kt`, `BlockchainTest.kt`, `ModelsTest.kt`, `QueueTest.kt`, and `StorageTest.kt`.
- `REQ-protocol-001`, `REQ-protocol-002`, `REQ-protocol-003`, `REQ-protocol-004`, and `REQ-protocol-005`: `EnvelopeTest.kt`, `AlgoChatTest.kt`, `CrossImplTest.kt`, `MessagePayloadTest.kt`, and `SignatureTest.kt`.
- `REQ-psk-001`, `REQ-psk-002`, `REQ-psk-003`, `REQ-psk-004`, and `REQ-psk-005`: the envelope, known-answer, state, hybrid-encryption, and exchange cases in `PSKTest.kt`.
- `REQ-cross-vectors-001`, `REQ-cross-vectors-002`, `REQ-cross-vectors-003`, and `REQ-cross-vectors-004`: the six producer-specific decrypt/export cases in `CrossImplTest.kt`.
