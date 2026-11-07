---
change: 70c-1-rust-joins-a-room-over-a-real-hybrid-session-the-way-typescript-does-from-a-shared-vector
artifact: docs
---

# Docs

- `TEST-VECTORS.md`: a "Room joined over a Hybrid session" section for `vectors/room-session-v1.json`. It covers the inputs, layout, cases, the seeded emitter, and how to regenerate and copy the file. A Coverage boundaries row says what it establishes (actual recipient handshake recovery for an action-5 delivery, and several senders in one epoch) and what it does not (blockchain authentication, removal and rekey, and the other four libraries).
- `specs/protocol/protocol.spec.md`: the Public API sentence names the vector. REQ-protocol-14 is added to `requirements.md` from the delta.
- `rs/README.md`: the conformance paragraph names the room test.
- `CHANGELOG.md`: an Unreleased entry for the Rust room-join vector (#80).
- `hi/crate.md` and `INTENT.md`: CRATE-8 to CRATE-12 and the line recording Leif's approval (already in this change's definition commit).
