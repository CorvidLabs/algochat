---
change: a-room-note-records-one-added-or-removed-person-so-a-room-can-hold-256-people-and-a-channel-is-another-room-owned-by
artifact: context
---

# Context

Leif confirmed on 2026-10-28 that a room should hold 256 people, that a channel is another room owned by the group owner, and that a removal sends a new key to everyone who stays. AlgoChat issue #31 records that want.

The current administration note repeats every member and must be at most 4096 bytes. With a 64-byte name and 16 admins it holds about 104 members. Raising the constant alone cannot create a 256-person room.

Clients already fold one operation at a time. The new note records that one person. Notes that already carry a full list still open.
