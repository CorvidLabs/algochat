---
change: specify-the-group-mailbox-membership-wrap-and-one-message-note
artifact: design
---

# Design

The mailbox is one Algorand address per group. The creator funds it with 100000 microAlgos. Members do not need the mailbox spending key.

0x06 reuses the hybrid session key and the 78-byte header. Only the protocol byte and the 101-byte plaintext are new. That keeps the wrap at PQ level 3 without a second KEM layout.

0x07 is the message. The header binds group id, epoch, sender, and counter. The message key is HKDF of the group key. A removed member never receives the next 0x06, so the next epoch does not open for them.
