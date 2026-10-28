---
change: go-speaks-the-delta-room-note-and-the-256-member-cap
artifact: design
---

# Design

Go follows the frozen delta layout. The prefix through the admin keys is unchanged. A new note writes the member-count sentinel 0xFFFF, the 32-byte subject, and a 32-byte parent group id. A full-list note keeps the old layout and must not name a parent.

`DraftAdmin` omits the member list. `ReduceAdmin` folds one operation at a time and, for a channel, also takes the parent timeline. `GROUP_MEMBER_MAX` is 256. `GROUP_ADMIN_MAX` stays 16. The owner is a separate field and is not one of those 16.

`DeliveryAuthorized` allows the new key for people who stayed. The removed subject may not receive it. `NextDeliveryBatch` returns at most 16 recipients and is not an atomic group. `PendingKeyDeliveries` is how a missed payment is resumed.
