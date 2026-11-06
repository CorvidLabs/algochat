---
change: 70c-2-rust-follows-a-room-key-change-and-resumes-an-interrupted-key-handout-the-way-typescript-does-from-a-shared
artifact: context
---

# Context

This is the second #70c row, issue #81, under the scope Leif approved on 2026-11-06 ("Ok yes I approve all", relayed by the orchestrator). Leif decided that the rooms work ships as algochat 0.8.0 (D-c3). The row serves two criteria:
- CRATE-9: "When a room key changes, a Rust app reads each message with the key for its own epoch, the same messages Raven web can read and no others."
- CRATE-10: "When a key handout is cut short, a Rust app resumes only the people who were missed, at most 16 at a time, the way Raven web does."

It covers GROUP-5.b to GROUP-5.d, GROUP-10 and GROUP-11 in `hi/group.md`. CRATE-9 and CRATE-10 were captured in #70c-1 (PR #84), so no new intent is captured here.

- PROTOCOL.md 5.8.5 records the removal, the resumed batch of 16 and the channel departure only as an author-reported LocalNet run, `ts/scripts/room-scale-localnet.ts`. No shared vector covers them, and no file in `rs/tests/` calls `pending_key_deliveries`, `next_delivery_batch`, `authorized_recipients` or `channel_departures`.
- `vectors/room-session-v1.json` (#70c-1) covers one epoch. This row starts from its accounts and goes on to removal, rotation and the channel.
- The orchestrator asked for this row as a definition only: the definition and the failing tests are committed now, and nothing is built until #70c-1's code lands. The branch is `leif/algochat-70c2-room-rekey` from #84's head `1496b19`, stacked on #70c-1, #70b and #70a.
- REQ ids: #73 holds 11, #68 holds 12, #70b holds 13 and #70c-1 holds 14, so this change takes REQ-protocol-15.
