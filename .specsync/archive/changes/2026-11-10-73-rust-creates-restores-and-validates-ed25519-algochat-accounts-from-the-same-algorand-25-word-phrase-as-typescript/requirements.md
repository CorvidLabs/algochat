---
change: 73-rust-creates-restores-and-validates-ed25519-algochat-accounts-from-the-same-algorand-25-word-phrase-as-typescript
artifact: requirements
---

# Requirements

Traceability: CRATE-4 and CRATE-6 in `hi/crate.md`, algochat#73. The canonical changes are in `deltas/protocol.md`.

- Rust validates, restores and creates Ed25519 accounts from a 25-word phrase, matching TypeScript in entropy, address, Ed25519, X25519 and ML-KEM-768 keys (REQ-protocol-11).
- Every phrase that is not exactly 25 lowercase list words separated by single spaces, with zero padding and the right checksum, is rejected by Rust and by TypeScript (REQ-protocol-11).
- Phrase vectors come from TypeScript and algosdk, never from Rust, and both implementations check them in CI (REQ-protocol-10, REQ-protocol-11).
- No phrase or secret is printed by a test, log or `Debug` output (REQ-protocol-11).
