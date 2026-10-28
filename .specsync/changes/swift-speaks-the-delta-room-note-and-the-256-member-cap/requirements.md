---
change: swift-speaks-the-delta-room-note-and-the-256-member-cap
artifact: requirements
---

# Requirements

- Swift drafts the same delta room note as TypeScript: member count 65535, one subject, then the parent group id. Thirty-two zero bytes mean the room is not a channel.
- A full-list note of 256 members is rejected. It does not fit in 4096 bytes.
- Folding delta notes builds a room of 256 members. The 257th add is rejected.
- An older full-list note still opens. `vectors/group-admin-v1.json` still reduces. `vectors/group-admin-delta-v1.json` matches.
- A channel is a separate room. The parent owner creates it. Parent membership does not copy people in. Reducing a channel takes the parent room's events.
- A room still has at most 16 admins. Key deliveries stay separate payments, at most 16 at a time. A missed payment can be resumed. A payment that already landed stays landed.
