---
change: 68-rust-writes-the-acpq-hybrid-key-announcement-byte-for-byte-the-way-typescript-does
artifact: tasks
---

# Tasks

- [x] Add the failing tests (`ts/src/pq/announce.test.ts`, `rs/tests/pq_announcement.rs`, the `SHARED` entry), commit them, and record the failures.
- [x] Add the TypeScript emitter, write `vectors/pq-announcement-v1.json`, and copy it to `rs/vectors/`.
- [x] Add `encode_pq_announcement` and `pq_announcement_signing_input` to `rs/src/pq.rs`.
- [x] Update TEST-VECTORS.md, the protocol specs, `rs/README.md` and `CHANGELOG.md`.
- [x] Run the TypeScript, Rust and release checks, the clean-clone qualification lanes and the mutation runs, then `fledge lanes run verify` and `fledge trust verify`, and record the evidence.

Human gates, not tasks: definition approval and the scoped implementation review, both relayed by the orchestrator. The PR is opened by the agent and merged only on Leif's decision.
