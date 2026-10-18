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
