---
change: a-room-note-records-one-added-or-removed-person-so-a-room-can-hold-256-people-and-a-channel-is-another-room-owned-by
artifact: tasks
---

# Tasks

- [x] Record GROUP-8 through GROUP-13 in hi/group.md.
- [x] Specify the delta note and the 256-member cap.
- [x] Implement the delta note, parent group id, and 256 cap in TypeScript.
- [x] Reject a full-list note of 256 members as too large, and fold a delta room up to 256 in unit tests.
- [x] Run ts/scripts/room-scale-localnet.ts against the already-running node at 127.0.0.1:4001.

Go, Rust, Python, Kotlin, and Swift still need the same bytes. That is a later change. Issue #31 stays open for it.
