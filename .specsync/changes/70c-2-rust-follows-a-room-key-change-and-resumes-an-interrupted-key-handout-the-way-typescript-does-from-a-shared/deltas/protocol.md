## Added

### REQUIREMENT REQ-protocol-15

Rust SHALL follow a room key change and an interrupted key handout the way TypeScript does. `vectors/room-rekey-v1.json` SHALL be written by `ts/scripts/emit-room-rekey-vector.ts` from synthetic seeds and the TypeScript library, never by the Rust code under test, with randomness from a fixed seeded stream inside that script only. It SHALL hold a room of 19 whose members each receive the epoch-1 key over a `0x04` handshake from the owner; a channel with its own group id, mailbox and key; the owner's removal of one member, which rotates the room to epoch 2; the epoch-2 key handed out to the 17 others in separate action-5 payments of at most 16, with the last payment of the first batch missed and resumed; the removed member's departure from the channel and the channel's own new key handed out the same way; `0x07` messages at both epochs in the room and the channel; and read, authorization and posting cases. TypeScript and Rust SHALL check every field, list and case of that file, Rust from its copy in `rs/vectors/`: the room and the channel SHALL reduce to the recorded states before and after the removal; every delivery SHALL open for its member and be authorized, and none SHALL give the removed member a new key; `authorized_recipients`, `next_delivery_batch` and `pending_key_deliveries` SHALL give the recorded lists, the missed payment SHALL be resumed and no landed payment SHALL repeat; and every message SHALL open only under the key for its own epoch, from a sender who may post there, while the removed member's earlier message stays readable under the old key. No library code, public API or wire format SHALL change.

#### Acceptance Criteria

- `cargo test --locked --test room_rekey` passes in `rs/` and inside the extracted `.crate`; every state, delivery, handout list, message and case matches TypeScript.
- No batch holds more than 16 payments, the missed payment is resumed first, and the epoch-2 deliveries are exactly the landed ones then the resumed ones, once each, with none to the removed member.
- Changing a recorded key, list, delivery, record, message epoch or result fails the Rust test; a file that differs from the emitter's output fails the TypeScript test, whose message names the regenerate command.
- A missing vector file fails both languages with the command that restores it.
