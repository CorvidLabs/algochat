---
change: 70c-2-rust-follows-a-room-key-change-and-resumes-an-interrupted-key-handout-the-way-typescript-does-from-a-shared
artifact: tasks
---

# Tasks

- [ ] Add the failing tests (`ts/src/pq/room-rekey.test.ts`, `rs/tests/room_rekey.rs`, the `SHARED` entry), commit them with this definition, and record the failures.
- [ ] After approval, and after #70c-1's code has landed: add the TypeScript emitter, write `vectors/room-rekey-v1.json`, and copy it to `rs/vectors/`.
- [ ] Update TEST-VECTORS.md, the protocol spec, `rs/README.md` and `CHANGELOG.md`.
- [ ] Run the TypeScript, Rust and release checks, the clean-clone qualification lanes and the mutation runs, then `fledge lanes run verify` and `fledge trust verify`, and record the evidence.

Human gates, not tasks: definition approval and the scoped implementation review, both relayed by the orchestrator. The PR is opened by the agent and merged only on Leif's decision. 0.8.0 is released only with Leif's approval.
