---
change: 70c-1-rust-joins-a-room-over-a-real-hybrid-session-the-way-typescript-does-from-a-shared-vector
artifact: tasks
---

# Tasks

- [ ] Add the failing tests (`ts/src/pq/room-session.test.ts`, `rs/tests/room_session.rs`, the `SHARED` entry), commit them, and record the failures.
- [ ] Add the TypeScript emitter, write `vectors/room-session-v1.json`, and copy it to `rs/vectors/`.
- [ ] Update TEST-VECTORS.md, the protocol spec, `rs/README.md` and `CHANGELOG.md`.
- [ ] Run the TypeScript, Rust and release checks, the clean-clone qualification lanes and the mutation runs, then `fledge lanes run verify` and `fledge trust verify`, and record the evidence.

Human gates, not tasks: definition approval and the scoped implementation review, both relayed by the orchestrator. The PR is opened by the agent and merged only on Leif's decision. Which release ships this (D-c3) is Leif's separate decision.
