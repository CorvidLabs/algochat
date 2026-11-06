---
change: 70b-rust-reads-a-long-two-way-hybrid-conversation-and-kept-extra-lock-notes-that-typescript-wrote
artifact: context
---

# Context

Release B (algochat 0.7.0), the #70b row, under the scope Leif approved on 2026-11-05 ("Approve intent + A and B"). It serves CRATE-2: "A Rust app and Raven web can read each other's messages, and shared test vectors prove that before the crate is released." It covers the first two bullets of algochat#70: a long two-way Hybrid chat, and older `0x02` Extra lock messages with kept secrets.

- No shared vector holds a TypeScript `0x04` handshake or `0x05` message. Rust's Hybrid checks are its own unit tests, `parity_fixture` (the ML-KEM key only) and the LocalNet mesh `ts/scripts/pq-cross-localnet.ts`, which needs LocalNet and six toolchains and is not part of the crate's tests.
- For Extra lock, `ts/conformance/vectors/04-psk-envelope.json` has one captured note at counter 0 and `03-psk-ratchet.json` a 10-step state transcript. No vector has a note at a nonzero counter, a sender reading its own kept note, or counter state carried across a restart.
- #70a (PR #75, not yet merged) adds `rs/vectors/`, byte-identical copies the release check enforces, and the `SHARED` list in `rs/tests/conformance.rs`. This branch is built on #75's head (`b867cf8`), as the orchestrator agreed, and merges `origin/main` once #75 lands.
- #73 (25-word phrase, REQ-protocol-11, `07-mnemonic-accounts.json`) and #68 (ACPQ write path, REQ-protocol-12) run in parallel. This change uses REQ-protocol-13, as the orchestrator assigned, and adds its files to the root `vectors/`, not to the numbered `ts/conformance/vectors/`.
