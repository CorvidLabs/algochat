---
change: python-speaks-the-delta-room-note-and-the-256-member-cap
artifact: design
---

# Design

Python follows the frozen delta layout. The prefix through the admin keys is unchanged. A new note writes the member-count sentinel 0xFFFF, the 32-byte subject, and a 32-byte parent group id. A full-list note keeps the old layout and must not name a parent.

`draft_admin` omits the member list. `reduce_admin` folds one operation at a time and takes the parent events for a channel. `GROUP_MEMBER_MAX` is 256. The admin cap stays 16. The owner is a separate field and is not one of those 16.

People who stayed may receive the new key. The removed subject may not. The next delivery batch is at most 16 separate payments and is not an atomic group. A missed payment is resumed from the recipients who have not been paid.
