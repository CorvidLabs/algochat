---
change: 70b-rust-reads-a-long-two-way-hybrid-conversation-and-kept-extra-lock-notes-that-typescript-wrote
artifact: tasks
---

# Tasks

- [ ] Add the failing tests (`ts/src/pq/conversation.test.ts`, `ts/src/psk/kept.test.ts`, `rs/tests/pq_conversation.rs`, `rs/tests/psk_kept.rs`, the two `SHARED` entries), commit them, and record the failures.
- [ ] Add the TypeScript emitter, write `vectors/pq-conversation-v1.json` and `vectors/psk-kept-v1.json`, and copy them to `rs/vectors/`.
- [ ] Update TEST-VECTORS.md, the protocol spec, `rs/README.md` and `CHANGELOG.md`.
- [ ] Run the TypeScript, Rust and release checks, the clean-clone qualification lanes and the mutation runs, then `fledge lanes run verify` and `fledge trust verify`, and record the evidence.

Human gates, not tasks: definition approval and the scoped implementation review, both relayed by the orchestrator. The PR is opened by the agent and merged only on Leif's decision.
