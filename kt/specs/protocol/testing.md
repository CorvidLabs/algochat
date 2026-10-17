---
spec: protocol.spec.md
---

## Test Plan

### Unit Tests

- Run `AlgoChatTest`, `EnvelopeTest`, `MessagePayloadTest`, and `SignatureTest` for key, crypto, wire, payload, signature, note-ceiling, and note-fee behavior.

### Integration Tests

- Run `CrossImplTest` against committed or sibling-produced fixtures to detect byte-level interoperability regressions.
