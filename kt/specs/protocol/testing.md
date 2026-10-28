---
spec: protocol.spec.md
---

## Test Plan

### Unit Tests

- Run `AlgoChatTest`, `EnvelopeTest`, `MessagePayloadTest`, `SignatureTest`, and `PQTest` for key, crypto, wire, payload, signature, note-ceiling, note-fee, and hybrid-session behavior. `EnvelopeTest` rejects a 141-byte standard frame and a note longer than 4096 bytes. `PQTest` rejects a 4097-byte authenticated PQ note before plaintext is returned.
- `GroupAdminTest` still reduces `vectors/group-admin-v1.json`. It rejects a 256-member full list as too large, folds delta notes from 1 member to 256, keeps a channel roster separate from its parent, and matches `vectors/group-admin-delta-v1.json`.

### Integration Tests

- Run `CrossImplTest` against committed or sibling-produced fixtures to detect byte-level interoperability regressions.

## PQ and fixture evidence boundary

`PQTest` directly consumes the committed `vectors/pq-mlkem768.json`: ML-KEM key/secret parity, combiner binding, recipient acceptance/sender reopening, tamper rejection, 4002-byte budget, and ACPQ exclusion. `CrossImplTest` reads optional sibling `.hex` directories; missing directories or individual files are not required successful interoperability evidence. The documentation audit does not claim a fresh Gradle run.
