---
change: kotlin-speaks-the-delta-room-note-and-the-256-member-cap
artifact: research
---

# Research

The TypeScript change froze the delta layout in `vectors/group-admin-delta-v1.json`. Encoding 256 members as a full list is 8192 bytes of keys before the fixed header, so it cannot fit in a 4096-byte note. The reducer already applies one add or remove. Kotlin had to follow that note instead of inventing its own.

A channel is another room: its own mailbox, its own key, and its own 256 seats. The parent group id is set. Without the parent timeline, a channel note does not bind. The Kotlin reducer therefore takes the parent events when the note names a parent.
