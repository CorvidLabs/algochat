---
change: 70c-2-rust-follows-a-room-key-change-and-resumes-an-interrupted-key-handout-the-way-typescript-does-from-a-shared
artifact: requirements
---

# Requirements

Traceability:
- CRATE-9 and CRATE-10 in `hi/crate.md`, with CRATE-3.
- GROUP-5.b to GROUP-5.d, GROUP-10 and GROUP-11 in `hi/group.md`.
- algochat#70 (rooms bullet) and issue #81.

The canonical change is in `deltas/protocol.md` (REQ-protocol-15).

- `vectors/room-rekey-v1.json` is written by TypeScript from synthetic seeds (REQ-protocol-15). It holds:
  - a room of 19, and the owner's removal of one member;
  - a key handout of the new key in separate payments of at most 16, where one payment is missed and then resumed;
  - a channel that the removed member departs, and its own new key;
  - messages at both epochs, and cases.
- Rust reduces the room and the channel to TypeScript's states before and after the removal. Every delivery opens for its member and is authorized, and the removed member gets no new key (REQ-protocol-15).
- Rust's `authorized_recipients`, `next_delivery_batch` and `pending_key_deliveries` give TypeScript's lists at every step of the handout. The missed payment is resumed, no landed payment repeats, and no batch is larger than 16 (REQ-protocol-15).
- Every message opens only under the key for its own epoch, from a sender who may post at that point. The removed member's earlier message stays readable under the old key (REQ-protocol-15).
- TypeScript and Rust check every field and case, Rust from its copy in `rs/vectors/`, also from the packaged crate (REQ-protocol-15, REQ-protocol-10).
- No library code, public API or wire format changes; Rust only reads these notes (REQ-protocol-15).
