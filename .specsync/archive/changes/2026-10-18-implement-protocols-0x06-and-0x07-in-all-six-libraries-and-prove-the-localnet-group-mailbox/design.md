---
change: implement-protocols-0x06-and-0x07-in-all-six-libraries-and-prove-the-localnet-group-mailbox
artifact: design
---

# Design

A 0x06 note is 195 bytes: the 78-byte hybrid header with protocol byte 0x06, a 101-byte plaintext, and a 16-byte tag. Associated data is the header. The key is the hybrid session key. The plaintext is action, epoch as a big-endian u32, group id, mailbox public key, and group key.

A 0x07 note starts with 54 bytes: version 0x02, protocol 0x07, group id, epoch, counter, nonce. Associated data is that header. The message key is HKDF-SHA256. Salt is epoch concatenated with counter. Input keying material is the group key. Info is the UTF-8 label AlgoChat-group-v1, the group id, and the 32-byte sender address taken from the payment, not from the note.

Open rejects a counter the caller already accepted for that sender and epoch. A removed member is not given the new group key, so opening the new 0x07 with the previous key fails authentication. The mailbox is funded once with 100000 microAlgos. Later notes are 0-microAlgo payments. The creator's 0x06 payments are 1:1 payments to each member.
