---
id: 70c-2-rust-follows-a-room-key-change-and-resumes-an-interrupted-key-handout-the-way-typescript-does-from-a-shared
state: draft
type: feature
base_commit: 1496b19f4f6f66c7aa7eb81f461b2b7dba9af323
---

# 70c-2: Rust follows a room key change and resumes an interrupted key handout the way TypeScript does, from a shared vector

## Intent

70c-2: Rust follows a room key change and resumes an interrupted key handout the way TypeScript does, from a shared vector

## Affected Canonical Specs

- `protocol`

## Acceptance Criteria

- cargo test --locked passes in rs/ and inside the unpacked algochat .crate, where tests/room_rekey.rs shows from the TypeScript-generated vectors/room-rekey-v1.json that: each account's address and keys come from its seed; the room's 20 records and the channel's records reduce to TypeScript's room and channel before and after the removal, the room moves to epoch 2 and the channel names its parent; channel_departures names exactly the removed member; every one of the 40 action-5 deliveries opens for its member over that member's session from the owner's handshake, gives the room or channel key for its epoch, and delivery_authorized accepts it, with no epoch-2 delivery to the removed member; authorized_recipients gives the same 17 room and 2 channel recipients as TypeScript, next_delivery_batch gives the same first batch of at most 16 and the same resumed batch, pending_key_deliveries gives the same pending list after the landed payments, the missed payment is resumed first, and the epoch-2 deliveries are exactly the landed ones then the resumed ones, once each; every 0x07 message opens once under the key for its epoch from a sender who may post there, and never under the other epoch's key; and every read, authorize and may_post case gives the same accepted or rejected result. bun test in ts/ shows the committed vector is exactly what ts/scripts/emit-room-rekey-vector.ts writes and that every case holds in TypeScript. No library, API or wire change.

## No-spec Rationale

Not applicable
