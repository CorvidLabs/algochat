---
change: 70b-rust-reads-a-long-two-way-hybrid-conversation-and-kept-extra-lock-notes-that-typescript-wrote
artifact: requirements
---

# Requirements

Traceability: CRATE-2 and CRATE-3 in `hi/crate.md`, algochat#70 (first two bullets). The canonical change is in `deltas/protocol.md` (REQ-protocol-13).

- `vectors/pq-conversation-v1.json` is written by TypeScript from synthetic seeds. It holds one `0x04` handshake each way, 32 `0x05` messages each way and handshake and message cases (REQ-protocol-13).
- Rust derives every session from the note and an account seed alone, as recipient and as sender, and both sides read every message (REQ-protocol-13).
- `vectors/psk-kept-v1.json` is written by TypeScript. It holds version `0x02` Extra lock notes under one kept secret at counters across session boundaries and up to 4294967295, tamper and wrong-secret cases, and a receive transcript with a restart (REQ-protocol-13).
- Rust reads every kept note as recipient and as sender, and its counter window gives TypeScript's result for every step, also after the state is saved and restored (REQ-protocol-13).
- TypeScript and Rust check every field and case of both files, Rust from its copies in `rs/vectors/`, also from the packaged crate (REQ-protocol-13, REQ-protocol-10).
- No library code, public API or wire format changes; Rust only reads these notes (REQ-protocol-13).
