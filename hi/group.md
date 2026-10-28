---
hi: 1
families: [GROUP]
---

# Group

## Intent

I want rooms I can own: a small invite-only team and a larger room people ask to join. Anyone else can create either kind. No token should come with the room. A signature or the mailbox key is not a promotion.

## Criteria

- **GROUP-1**  I can create a room, and I start as its only owner.
  - **GROUP-1.a**  Creating a room does not mint or require an NFT.
  - **GROUP-1.b**  I choose whether a new room is invite-only or accepts join requests, and anyone else can create either kind.
  - **GROUP-1.c**  I can belong to an invite-only room and an ask-to-join room at the same time, and membership in one does not put me in the other.
- **GROUP-2**  An invite-only room accepts a new member only when an owner or admin invites them.
  - **GROUP-2.a**  An ask-to-join room shows a public description, anyone may ask to join, and an owner or admin must accept before a key is sent.
  - **GROUP-2.b**  An owner or admin can decline a join request.
- **GROUP-3**  I can appoint admins, and I can hand ownership to a member.
  - **GROUP-3.a**  An admin can add a member, remove a member, rotate the room key, and change the room name or joining rule.
  - **GROUP-3.b**  An admin cannot transfer ownership, appoint or dismiss an admin, or remove the owner.
  - **GROUP-3.c**  Signing a transaction does not make the signer an admin, and holding the mailbox spending key does not make that person the owner.
- **GROUP-4**  I accept a change to the room only when the previous accepted room state authorized that sender to make it.
  - **GROUP-4.a**  A later change that still points at an older room state is rejected, even if an admin signed it.
  - **GROUP-4.b**  A copied administration record is rejected.
- **GROUP-5**  A new room key is delivered only to people who are members after the change that authorized it.
  - **GROUP-5.a**  Adding a member sends the current key only to that member and does not rotate the key.
  - **GROUP-5.b**  Removal, an explicit rekey, or an ownership transfer rotates the key and delivers it only to the members who remain.
  - **GROUP-5.c**  A person who was removed does not receive that new key and cannot read messages sent after the change.
  - **GROUP-5.d**  Messages they already opened stay readable.
- **GROUP-6**  An ordinary message is one payment to the room mailbox.
  - **GROUP-6.a**  I ignore a mailbox note when the accepted room state does not allow that sender to post it.
- **GROUP-7**  I can still open a membership note and a mailbox message that were written before administration records existed.
- **GROUP-8**  I want a room change to record the one person added or removed, so I can rebuild the member list by folding that history.
  - **GROUP-8.a**  I want a note that already carries the full member list to still open, and I want that room to keep working.
  - **GROUP-8.b**  I want one room to hold 256 people.
- **GROUP-9**  I want a channel to be another room with its own mailbox and key, pointing at a parent room.
  - **GROUP-9.a**  I want the group owner to create a channel and to own it.
  - **GROUP-9.b**  I do not want being in the parent room to add me to the channel.
- **GROUP-10**  I want removing someone to rotate the key and deliver it only to the members who remain.
  - **GROUP-10.a**  I want those deliveries to be separate payments, up to 16 at a time, and I want a payment that lands to be kept.
  - **GROUP-10.b**  I want to resume the people who were missed, and I do not want that delivery to be an atomic group.
- **GROUP-11**  I want leaving the parent room, or being removed from it, to remove me from every channel of that room.
  - **GROUP-11.a**  I want the group owner to deliver each channel's new key the same way.
- **GROUP-12**  I want an owner or an admin to be able to remove a person and pay for the new key.
- **GROUP-13**  I want at most 16 admins, a name of at most 64 bytes, and a message to stay one payment to that room's mailbox.
