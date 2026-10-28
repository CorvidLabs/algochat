# Lesson bundle — a-room-note-records-one-added-or-removed-person-so-a-room-can-hold-256-people-and-a-channel-is-another-room-owned-by

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: A room note records one added or removed person so a room can hold 256 people, and a channel is another room owned by the group owner
- **Kind**: Feature
- **Specs**: protocol
- **Paths**: PROTOCOL.md, TEST-VECTORS.md, specs/protocol/protocol.spec.md, specs/protocol/requirements.md, hi/group.md
- **Acceptance**: A room note records the one person added or removed and clients rebuild the member list. Old full-list notes still open. A room can hold 256 people. A channel is another room owned by the group owner.

## Evidence

- Verification commit: `ac6351e8f890e3d45deebc630dcc4bacc781f8da`
- Base commit: `fe311d125fba020091f923b2f6ab28d554313679`
- Verified by: `specsync check --spec protocol`

## From the change's context.md

# Context

Leif confirmed on 2026-10-28 that a room should hold 256 people, that a channel is another room owned by the group owner, and that a removal sends a new key to everyone who stays. AlgoChat issue #31 records that want.

The current administration note repeats every member and must be at most 4096 bytes. With a 64-byte name and 16 admins it holds about 104 members. Raising the constant alone cannot create a 256-person room.

Clients already fold one operation at a time. The new note records that one person. Notes that already carry a full list still open.

## From the change's design.md

# Design

The prefix through the admin keys is unchanged. After the admins, a delta note writes the member-count sentinel 0xFFFF, then the 32-byte subject, then a 32-byte parent group id. Thirty-two zero bytes mean this room is not a channel.

A full-list note stays the old layout. The reducer checks that list against the folded members. A delta note has no list to check. Folding the operation produces the members.

## From the change's testing.md

# Testing

TypeScript unit tests cover a rejected 256-member full-list note, a delta room folded to 256, old full-list notes still opening, and a channel parent id.

LocalNet, reported by the implementing lane and not re-run while opening this change: `cd ts && bun scripts/room-scale-localnet.ts` on http://127.0.0.1:4001. The node was not restarted. The room reached 256 members, one remove left 255, 15 of 16 key payments landed and were kept, the missed recipient was resumed, and a channel create plus its own key resume confirmed.

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| REQ-protocol-8 | ts/src/pq/group-admin.test.ts rejects a 256-member full list, folds a delta room to 256, and still reduces vectors/group-admin-v1.json. |

## Where these lessons go

- `specs/protocol/context.md`
