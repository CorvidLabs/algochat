---
change: kotlin-speaks-the-delta-room-note-and-the-256-member-cap
artifact: testing
---

# Testing

`GroupAdminTest` covers `a full-list note of 256 members is too large, and a delta note folds through 256`, `a channel keeps its own roster, and a missed key payment can resume`, and `group-admin-delta-v1 vector matches the frozen delta bytes`. A channel keeps its own roster. A missed key payment can resume.

The joint LocalNet run that included this Kotlin library is recorded with the protocol work. It is not re-run as the gate for this archive. The node was not restarted.

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| Same delta note as TypeScript | `kt/src/main/kotlin/com/corvidlabs/algochat/GroupAdmin.kt` drafts the 0xFFFF sentinel, one subject, and the parent group id. The tests match `vectors/group-admin-delta-v1.json`. |
| Full list of 256 is rejected | The Kotlin tests reject that note as too large. |
| Delta fold through 256 | The Kotlin tests fold from 1 member to 256. |
| Old full-list notes still open | The Kotlin tests still reduce `vectors/group-admin-v1.json`. |
| Channel roster stays separate | The Kotlin tests reduce a channel with its parent events and do not copy the parent roster. |
| Missed key payment can resume | The Kotlin tests cover a resumed delivery after a payment that already landed. |
