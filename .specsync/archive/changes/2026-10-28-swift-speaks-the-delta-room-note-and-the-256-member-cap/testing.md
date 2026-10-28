---
change: swift-speaks-the-delta-room-note-and-the-256-member-cap
artifact: testing
---

# Testing

`swift/Tests/AlgoChatTests/GroupAdminTests.swift` covers `foldsDeltaThrough256`, `channelKeepsItsOwnRoster`, and the frozen `vectors/group-admin-delta-v1.json` match. A channel keeps its own roster. A missed key payment can resume.

The joint LocalNet run that included this Swift library is recorded with the protocol work. It is not re-run as the gate for this archive. The node was not restarted.

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| Same delta note as TypeScript | `swift/Sources/AlgoChat/Crypto/GroupAdmin.swift` drafts the 0xFFFF sentinel, one subject, and the parent group id. The tests match `vectors/group-admin-delta-v1.json`. |
| Full list of 256 is rejected | The Swift tests reject that note as too large. |
| Delta fold through 256 | The Swift tests fold from 1 member to 256. |
| Old full-list notes still open | The Swift tests still reduce `vectors/group-admin-v1.json`. |
| Channel roster stays separate | The Swift tests reduce a channel with its parent events and do not copy the parent roster. |
| Missed key payment can resume | The Swift tests cover a resumed delivery after a payment that already landed. |
