---
change: a-room-note-records-one-added-or-removed-person-so-a-room-can-hold-256-people-and-a-channel-is-another-room-owned-by
artifact: research
---

# Research

PROTOCOL.md states the note layout and the 4096-byte cap. Encoding 256 members is 8192 bytes of keys before the fixed header, so it cannot fit. The reducer already applies one add or remove. The note's full list is a check, not the only way to know the members.

Leif chose to keep a payment that lands, so the 16 deliveries are not one atomic group.
