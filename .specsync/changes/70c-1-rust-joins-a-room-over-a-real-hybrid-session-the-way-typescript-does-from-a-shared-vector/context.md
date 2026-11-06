---
change: 70c-1-rust-joins-a-room-over-a-real-hybrid-session-the-way-typescript-does-from-a-shared-vector
artifact: context
---

# Context

This is the first #70c row, issue #80, under the scope Leif approved on 2026-11-06 ("Ok yes I approve all", relayed by the orchestrator). The approval covered the rows in order, CRATE-8 to CRATE-12 as drafted, and decisions D-c1, D-c2 and D-c4. D-c3, which crate release ships this, is still his decision. The row serves CRATE-8: "I can join a room from Rust the way Raven web does: I open the room key sent to me over a real Hybrid session and read every message in that room." It covers the rooms bullet of algochat#70 for a room made by delta `0x03` records: GROUP-5 and GROUP-6.

- `vectors/group-admin-v1.json` has one action-5 delivery, but under a session key the file supplies. TEST-VECTORS.md "Coverage boundaries" says it does not establish "actual recipient handshake recovery".
- `vectors/group-v1.json` has one `0x07` message at epoch 1, counter 0, again under a supplied key. No shared vector has a member opening its delivery from its own recovery of a real handshake, or a `0x07` conversation with several senders.
- This branch is stacked on #70b (PR #78) at `7e164e4`, which includes #78's CodeQL test-message fix. The orchestrator agreed to the stacking. #70b is in turn built on #75's head. This branch reuses #70b's seeded random stream and merges `origin/main` as those PRs land, with no rebase or force push.
- REQ ids: #73 holds REQ-protocol-11, #68 holds 12 and #70b holds 13, so this change takes REQ-protocol-14.
- CRATE-8 to CRATE-12 are captured in `hi/crate.md` in this change, exactly as Leif approved them, with a line recording where that approval came from.
