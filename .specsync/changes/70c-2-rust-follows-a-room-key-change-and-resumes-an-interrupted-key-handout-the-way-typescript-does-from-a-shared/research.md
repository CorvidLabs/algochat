---
change: 70c-2-rust-follows-a-room-key-change-and-resumes-an-interrupted-key-handout-the-way-typescript-does-from-a-shared
artifact: research
---

# Research

- A spike ran in a scratch clone at `1496b19`, not in this branch. It is not evidence for this change; the tests are rerun in the branch, failing first.
  - The draft emitter wrote the file twice with identical bytes (198,072 bytes).
  - It holds 19 accounts, 25 administration records (20 for the room and 5 for the channel), 18 handshakes, 40 deliveries, 10 messages and 16 cases.
  - A draft Rust reader passed 5 of 5 tests and a draft TypeScript test passed 6 of 6.
- The flow follows `ts/scripts/room-scale-localnet.ts`, the PROTOCOL.md 5.8.5 run:
  - `authorizedRecipients` for the removal, without the owner, who made the key, gives 17 recipients.
  - `nextDeliveryBatch` gives 16. The last of those 16 does not land.
  - `pendingKeyDeliveries` then gives the missed one and the 17th, and the resumed batch sends both.
  - The channel's two remaining members are handed out the same way, with one missed.
- In the spike, Rust's batch helpers return the same lists in the same order as TypeScript's.
  - Rust's `next_delivery_batch` always uses 16. TypeScript's `nextDeliveryBatch` takes a batch size of 1 to 16. The vector uses the default.
- PROTOCOL.md 5.8.3 sets the rules:
  - A removal authorizes delivery to every remaining member except the subject, at the record's epoch.
  - A message key binds its epoch, so an epoch-2 note cannot open under the epoch-1 key.
  - Messages already opened stay readable under the old key.
- Mutations run against the spike drafts. Each of these failed the draft Rust test:
  - a batch of 17;
  - `pending_key_deliveries` ignoring landed payments;
  - `channel_departures` naming nobody;
  - `sender_may_post` ignoring the epoch;
  - `delivery_authorized` ignoring the epoch;
  - seven vector mutations.
- One Rust check cannot be observed by any vector: a removal never authorizes its own subject. `delivery_authorized` first requires the recipient to be a member after the record, and the subject of a removal never is. A mutation that drops the subject check therefore passed every test. That check is defense in depth, and this change does not claim to test it.
