---
change: a-room-note-records-one-added-or-removed-person-so-a-room-can-hold-256-people-and-a-channel-is-another-room-owned-by
artifact: design
---

# Design

The prefix through the admin keys is unchanged. After the admins, a delta note writes the member-count sentinel 0xFFFF, then the 32-byte subject, then a 32-byte parent group id. Thirty-two zero bytes mean this room is not a channel.

A full-list note stays the old layout. The reducer checks that list against the folded members. A delta note has no list to check. Folding the operation produces the members.
