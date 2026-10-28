---
change: go-speaks-the-delta-room-note-and-the-256-member-cap
artifact: testing
---

# Testing

`go/group_admin_test.go` rejects a full-list note of 256 members as too large, folds delta notes from 1 member to 256, keeps `vectors/group-admin-v1.json` readable, and matches `vectors/group-admin-delta-v1.json`. A channel keeps its own roster. A missed key payment can resume.

The joint LocalNet run that included this Go library is recorded with the protocol work. It is not re-run as the gate for this archive. The node was not restarted.

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| Same delta note as TypeScript | `go/group_admin.go` drafts the 0xFFFF sentinel, one subject, and the parent group id. `group_admin_test.go` matches `vectors/group-admin-delta-v1.json`. |
| Full list of 256 is rejected | `group_admin_test.go` rejects that note as too large. |
| Delta fold through 256 | `group_admin_test.go` folds from 1 member to 256. |
| Old full-list notes still open | `group_admin_test.go` still reduces `vectors/group-admin-v1.json`. |
| Channel roster stays separate | `group_admin_test.go` reduces a channel with its parent events and does not copy the parent roster. |
| Missed key payment can resume | `group_admin_test.go` covers a resumed delivery after a payment that already landed. |
