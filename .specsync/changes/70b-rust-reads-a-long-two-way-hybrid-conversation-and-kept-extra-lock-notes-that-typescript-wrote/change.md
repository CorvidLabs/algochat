---
id: 70b-rust-reads-a-long-two-way-hybrid-conversation-and-kept-extra-lock-notes-that-typescript-wrote
state: draft
type: feature
base_commit: b867cf8fe8afaf9e7a4e899f5a58fb6dfd6f7f45
---

# 70b: Rust reads a long two-way Hybrid conversation and kept Extra lock notes that TypeScript wrote

## Intent

70b: Rust reads a long two-way Hybrid conversation and kept Extra lock notes that TypeScript wrote

## Affected Canonical Specs

- `protocol`

## Acceptance Criteria

- cargo test --locked passes in rs/ and inside the unpacked algochat .crate, where tests/pq_conversation.rs shows that both accounts derive every session key of the TypeScript-written vectors/pq-conversation-v1.json from their seeds alone (recipient accept and sender recovery), that both sides read all 64 0x05 messages, 32 each way including one per direction at the 4096-byte ceiling, and that every handshake and message case gives TypeScript's result; and tests/psk_kept.rs shows that the recipient and the sender read every kept version 0x02 Extra lock note of vectors/psk-kept-v1.json, including counters 0, 99, 100, 199, 200 and 4294967295, that every tamper and wrong-secret case gives TypeScript's result, and that the counter window gives TypeScript's result for every step, including after the state is saved and restored. bun test in ts/ shows both committed files are exactly what ts/scripts/emit-conversation-vectors.ts writes and that every case holds in TypeScript. No library code, public API or wire format changes.

## No-spec Rationale

Not applicable
