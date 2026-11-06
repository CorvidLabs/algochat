---
change: 70c-2-rust-follows-a-room-key-change-and-resumes-an-interrupted-key-handout-the-way-typescript-does-from-a-shared
artifact: docs
---

# Docs

- `TEST-VECTORS.md`: a "Room key rotation and an interrupted handout" section for `vectors/room-rekey-v1.json`. It covers the inputs, flow, handout lists, cases, the seeded emitter, and how to regenerate and copy the file. A Coverage boundaries row says what it establishes (rotation on removal, resumed batches of 16, current-epoch reading, and channel departure and rekey) and what it does not (blockchain authentication, rekey and transfer records, a removal's own-subject check, and the other four libraries).
- `specs/protocol/protocol.spec.md`: the Public API sentence names the vector. REQ-protocol-15 is added to `requirements.md` from the delta.
- `rs/README.md`: the conformance paragraph names the room-rekey test.
- `CHANGELOG.md`: an Unreleased entry for the Rust room-rekey vector (#81).
