---
change: a-room-note-records-one-added-or-removed-person-so-a-room-can-hold-256-people-and-a-channel-is-another-room-owned-by
artifact: requirements
---

# Requirements

- A room change records the one person added or removed. Clients rebuild the member list by folding history.
- A note that already carries the full member list still opens.
- One room can hold 256 people.
- A channel is another room with its own mailbox and key. The group owner creates it and owns it. Membership in the parent does not add a person to the channel.
- Removing someone delivers a new key only to the members who remain, as separate payments, up to 16 at a time. A payment that lands is kept. Missed people can be resumed.
- Leaving the parent room, or being removed from it, removes that person from every channel. The group owner delivers each channel's new key the same way.
- An owner or an admin can remove a person and pay for the new key.
- A room still has at most 16 admins and a name of at most 64 bytes. A message is still one payment to that room's mailbox.
