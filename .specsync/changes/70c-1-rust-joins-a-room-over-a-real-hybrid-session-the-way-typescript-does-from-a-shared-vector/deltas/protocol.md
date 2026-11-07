## Added

### REQUIREMENT REQ-protocol-14

Rust SHALL join a room the way TypeScript does. `vectors/room-session-v1.json` SHALL be written by `ts/scripts/emit-room-session-vector.ts` from synthetic seeds and the TypeScript library, never by the Rust code under test, with randomness from a fixed seeded stream inside that script only. It SHALL hold an owner, two members and an outsider whose addresses are their accounts' Ed25519 public keys; delta `0x03` records that create an invite-only room and add both members; a `0x04` handshake from the owner to each member and that member's 227-byte `0x06` action-5 delivery under it; `0x07` messages from the owner and both members with per-sender counters; a `0x07` note from the outsider under the room key; and delivery, authorization and message cases. TypeScript and Rust SHALL check every field and case of that file, Rust from its copy in `rs/vectors/`: the records SHALL reduce to the same room, each member SHALL recover its session from the handshake with its own seed and open its delivery, `delivery_authorized` SHALL accept each delivery against the accepted records and refuse the others, every message SHALL open with per-sender replay state and a repeated `(sender, epoch, counter)` SHALL be rejected, and the outsider's note SHALL be refused by `sender_may_post` even though it opens. No library code, public API or wire format SHALL change.

#### Acceptance Criteria

- `cargo test --locked --test room_session` passes in `rs/` and inside the extracted `.crate`; each member derives the recorded session, opens its room key and reads every message.
- Every delivery, authorization and message case gives the same result in TypeScript and Rust.
- Changing one byte of a recorded note, the room key, a recorded member or result fails the Rust test; a file that differs from the emitter's output fails the TypeScript test, whose message names the regenerate command.
- A missing vector file fails both languages with the command that restores it.
