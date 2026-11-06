---
change: 70c-2-rust-follows-a-room-key-change-and-resumes-an-interrupted-key-handout-the-way-typescript-does-from-a-shared
artifact: design
---

# Design

- **Emitter** `ts/scripts/emit-room-rekey-vector.ts`, run from `ts/` with an optional output directory.
  - Inputs:
    - The owner, `member_a` and `member_b` use the seeds of `room-session-v1.json`.
    - Sixteen further members, `m03` to `m18`, use the byte `0x30 + n` repeated 32 times.
    - An address is the seed's Ed25519 public key.
    - The room's group id is `0x77` and its mailbox `0x88`; the channel's are `0x79` and `0x89`. All four are repeated fill bytes.
    - Transaction ids are fill bytes `0x01` upwards, at rising rounds.
  - Randomness: within this process only, #70b's SHA-256 counter stream runs under the label `AlgoChat test vector room-rekey-v1`. Room keys come from the same stream, and the library is unchanged.
  - Every note comes from the library: `draftAdmin`, `reduceAdmin`, `initiatePQSession`, `sealGroupKeyDelivery` and `sealGroupMessage`. The emitter reads everything back and throws if any result differs from the one intended.
- **Flow:**
  1. The owner creates an invite-only room and adds 18 members. Each member gets a `0x04` handshake from the owner and an epoch-1 action-5 delivery that cites its add.
  2. The owner creates a channel with its own group id, mailbox and key, adds `member_a`, `member_b` and `m03`, and sends each a channel delivery.
  3. Messages at epoch 1 go to the room (four senders, including `member_b`) and to the channel (two senders).
  4. The owner removes `member_b`, which rotates the room to epoch 2. The 17 recipients are handed out in a first batch of 16, of which 15 land, then a resumed batch of the missed one and the 17th.
  5. Messages at epoch 2 go to the room from three senders.
  6. `channel_departures` names `member_b`. The owner removes them from the channel, which rotates it to its epoch 2, and hands out the channel's new key to its 2 remaining members, with one missed and resumed. Then one channel message is sent at epoch 2.
- **`vectors/room-rekey-v1.json`**:
  - `batch_size` (16) and `accounts`: 19 accounts, each with `seed`, `address`, `x25519_public` and `encaps_key`.
  - `rooms.room` and `rooms.channel`: `group_id`, `mailbox`, `name`, and `keys` for epochs 1 and 2.
  - `admin`: 25 records in posting order, each with `name`, `room`, `sender`, `tx_id`, `round`, `offset` and `note`.
  - `states`: TypeScript's `room_before_removal`, `room`, `channel_before_removal` and `channel`. Each has the owner, admins, sorted members, epoch, head and parent group id.
  - `handshakes`: one per member, each with `name`, `recipient`, `note`, `handshake_id` and `session_key`.
  - `deliveries`: 40 action-5 notes in sending order, each with `room`, `recipient`, `handshake`, `epoch` and `admin_tx_id`.
  - `handouts.room` and `handouts.channel`: the record and the `recipients`, `first`, `landed`, `pending` and `resumed` lists, by account name.
  - `channel_departures`.
  - `messages`: 10, each with `index`, `room`, `sender`, `epoch`, a per-sender `counter`, `plaintext` and `note`.
  - `cases`, each `accepted` or `rejected`:
    - `read` (a message under the key of a given epoch): an old message under the old key is accepted; a new message under the old key, a rekeyed channel message under the channel's old key and under the room's new key are rejected.
    - `authorize`: the removal authorizes a remaining member at epoch 2, but not the removed member and not at epoch 1. The channel removal authorizes a remaining channel member, but not the removed member. The room's removal authorizes nothing in the channel.
    - `may_post`: a remaining member may post at epoch 2. Nobody may post at epoch 1 after the rotation, and the removed member may not post in the room or the channel.
- **Checks**:
  - `ts/src/pq/room-rekey.test.ts` runs the emitter into a temporary directory and requires the committed file byte for byte. The failure names the regenerate command. It then checks every field, list and case with the TypeScript functions.
  - `rs/tests/room_rekey.rs` reads the `rs/vectors/` copy through the crate's public API:
    - `reduce_admin` and `reduce_admin_with_parent`;
    - `accept_pq_handshake` and `open_group_key_delivery`;
    - `delivery_authorized`, `authorized_recipients`, `next_delivery_batch` and `pending_key_deliveries`;
    - `channel_departures`, `open_group_message` and `sender_may_post`.

    An unknown field, op or result fails, and so does a missing file.
  - Failure messages name a case, an index or a role, never an account.
  - The file joins `SHARED` in `rs/tests/conformance.rs`.
