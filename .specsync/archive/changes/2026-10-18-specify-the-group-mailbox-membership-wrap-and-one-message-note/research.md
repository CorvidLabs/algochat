---
change: specify-the-group-mailbox-membership-wrap-and-one-message-note
artifact: research
---

# Research

Algorand can pay one address. It cannot multicast a note. A 0-amount payment to an unfunded address fails, so the mailbox is funded once at the minimum balance of 100000 microAlgos.

ML-KEM-768 is FIPS 203 category 3. Delivering the group key inside the hybrid session makes the wrap PQ level 3. An everyday X25519 wrap would make the group level 0. A 32-byte Extra lock secret would make it level 1. This version requires the level 3 wrap so there is one layout.

A group of about 16 can carry one 101-byte membership record per member. Each record is its own 0x06 note, not one note for the whole roster.
