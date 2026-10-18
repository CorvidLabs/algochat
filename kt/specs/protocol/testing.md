---
spec: protocol.spec.md
---

## Test Plan

### Unit Tests

- Run `AlgoChatTest`, `EnvelopeTest`, `MessagePayloadTest`, `SignatureTest`, and `PQTest` for key, crypto, wire, payload, signature, note-ceiling, note-fee, and hybrid-session behavior.

### Integration Tests

- Run `CrossImplTest` against committed or sibling-produced fixtures to detect byte-level interoperability regressions.
