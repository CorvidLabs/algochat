---
change: 68-rust-writes-the-acpq-hybrid-key-announcement-byte-for-byte-the-way-typescript-does
artifact: docs
---

# Docs

- `TEST-VECTORS.md`: a "Hybrid key announcement" section for `vectors/pq-announcement-v1.json` (inputs, outputs, case list, how to regenerate and copy), and a row in Coverage boundaries saying TypeScript and Rust check it and the other four libraries don't yet.
- `specs/protocol/protocol.spec.md`: the Public API sentence names the new vector; REQ-protocol-12 is added to `requirements.md` from the delta.
- `rs/specs/protocol/protocol.spec.md`: rows for `encode_pq_announcement` and `pq_announcement_signing_input`, and a Change Log row.
- `rs/README.md`: the Hybrid paragraph says the crate encodes and signs ACPQ announcements as well as parsing them.
- `CHANGELOG.md`: an Unreleased entry for the Rust ACPQ write path (#68).
