# Lesson bundle: swift-speaks-the-delta-room-note-and-the-256-member-cap

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Swift speaks the delta room note and the 256 member cap
- **Kind**: Feature
- **Paths**: swift/specs/algochat/algochat.spec.md, swift/specs/algochat/context.md, swift/specs/algochat/tasks.md, swift/specs/algochat/testing.md, swift/Sources/AlgoChat/Crypto/GroupAdmin.swift, swift/Tests/AlgoChatTests/GroupAdminTests.swift
- **Acceptance**: Swift drafts and reduces the same delta room note as TypeScript. A full-list note of 256 members is rejected. A delta note folds through 256. Old full-list notes still open. A channel keeps its own roster. A missed key payment can be resumed.

## Evidence

- Verification commit: `47697e240992f3bba16b7546805b6c13646c10c1`
- Base commit: `d95c89887c2f5129371d642ae9bf05cc5c724555`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

The protocol change already records one added or removed person per room note, a 256 member cap, and a channel as another room owned by the group owner. That contract is the base of this branch. Swift still had to speak the same bytes.

This change is the Swift implementation of that contract. It does not add a second note layout. PROTOCOL.md, the canonical protocol spec, and the frozen vectors stay as the base left them.

The cross-library tool glue that passes a parent room into the local test adapter is not part of this change. It stays uncommitted while review of the joint run continues.

## From the change's design.md

# Design

Swift follows the frozen delta layout. The prefix through the admin keys is unchanged. A new note writes the member-count sentinel 0xFFFF, the 32-byte subject, and a 32-byte parent group id. A full-list note keeps the old layout and must not name a parent.

`GroupAdmin.draft` omits the member list. `GroupAdmin.reduce` takes the parent events for a channel. `memberMax` is 256. The admin cap stays 16. The owner is a separate field and is not one of those 16.

People who stayed may receive the new key. The removed subject may not. The next delivery batch is at most 16 separate payments and is not an atomic group. A missed payment is resumed from the recipients who have not been paid.

## From the change's testing.md

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

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
