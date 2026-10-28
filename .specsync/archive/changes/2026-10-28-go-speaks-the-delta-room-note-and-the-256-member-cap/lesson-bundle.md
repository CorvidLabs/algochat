# Lesson bundle — go-speaks-the-delta-room-note-and-the-256-member-cap

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Go speaks the delta room note and the 256 member cap
- **Kind**: Feature
- **Paths**: go/specs/algochat/algochat.spec.md, go/specs/algochat/context.md, go/specs/algochat/testing.md, go/group_admin.go
- **Acceptance**: Go drafts and reduces the same delta room note as TypeScript. A full-list note of 256 members is rejected. A delta note folds through 256. Old full-list notes still open. A channel keeps its own roster. A missed key payment can be resumed.

## Evidence

- Verification commit: `1af7a6482cbf51e0888a92ac78ffdfb1662d5c10`
- Base commit: `2ed2718d632cbaee654ef7c86fd975e510606b8c`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

The protocol change already records one added or removed person per room note, a 256 member cap, and a channel as another room owned by the group owner. That contract is the base of this branch. Go still had to speak the same bytes.

This change is the Go implementation of that contract. It does not add a second note layout. PROTOCOL.md, the canonical protocol spec, and the frozen vectors stay as the base left them.

The cross-library tool glue that passes a parent room into the local test adapter is not part of this change. It stays uncommitted while review of the joint run continues.

## From the change's design.md

# Design

Go follows the frozen delta layout. The prefix through the admin keys is unchanged. A new note writes the member-count sentinel 0xFFFF, the 32-byte subject, and a 32-byte parent group id. A full-list note keeps the old layout and must not name a parent.

`DraftAdmin` omits the member list. `ReduceAdmin` folds one operation at a time and, for a channel, also takes the parent timeline. `GROUP_MEMBER_MAX` is 256. `GROUP_ADMIN_MAX` stays 16. The owner is a separate field and is not one of those 16.

`DeliveryAuthorized` allows the new key for people who stayed. The removed subject may not receive it. `NextDeliveryBatch` returns at most 16 recipients and is not an atomic group. `PendingKeyDeliveries` is how a missed payment is resumed.

## From the change's testing.md

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

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
