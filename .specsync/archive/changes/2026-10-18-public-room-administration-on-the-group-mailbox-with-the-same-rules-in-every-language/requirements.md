---
change: public-room-administration-on-the-group-mailbox-with-the-same-rules-in-every-language
artifact: requirements
---

# Requirements

REQ-protocol-6 is the normative contract. Each library reduces protocol 0x03 and seals 0x06 action 5 as PROTOCOL.md section 5.8 and vectors/group-admin-v1.json specify. A client accepts an administration record only when the parent state authorized that sender. A join request does not advance the room head. Adding a member does not rotate the room key. Removal, rekey, and ownership transfer rotate it. The mailbox spending key is not ownership. A legacy group-v1 note still opens and does not create an owner.
