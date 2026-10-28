---
change: a-room-note-records-one-added-or-removed-person-so-a-room-can-hold-256-people-and-a-channel-is-another-room-owned-by
artifact: testing
---

# Testing

TypeScript unit tests cover a rejected 256-member full-list note, a delta room folded to 256, old full-list notes still opening, and a channel parent id.

LocalNet, reported by the implementing lane and not re-run while opening this change: `cd ts && bun scripts/room-scale-localnet.ts` on http://127.0.0.1:4001. The node was not restarted. The room reached 256 members, one remove left 255, 15 of 16 key payments landed and were kept, the missed recipient was resumed, and a channel create plus its own key resume confirmed.

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| REQ-protocol-8 | ts/src/pq/group-admin.test.ts rejects a 256-member full list, folds a delta room to 256, and still reduces vectors/group-admin-v1.json. |
