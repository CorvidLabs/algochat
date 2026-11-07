---
change: 70b-rust-reads-a-long-two-way-hybrid-conversation-and-kept-extra-lock-notes-that-typescript-wrote
artifact: docs
---

# Docs

- `TEST-VECTORS.md`: a "Hybrid conversation" section for `vectors/pq-conversation-v1.json` and a "Kept Extra lock notes" section for `vectors/psk-kept-v1.json` (inputs, layout, cases, the seeded emitter, how to regenerate and copy), and Coverage boundaries rows saying TypeScript and Rust check them and the other four libraries don't yet.
- `specs/protocol/protocol.spec.md`: the Public API sentence names the two vectors; REQ-protocol-13 is added to `requirements.md` from the delta.
- `rs/README.md`: the conformance paragraph names the two vectors the crate's tests read.
- `CHANGELOG.md`: an Unreleased entry for the Rust Hybrid conversation and kept Extra lock vectors (#70b).
