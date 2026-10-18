---
change: public-room-administration-on-the-group-mailbox-with-the-same-rules-in-every-language
artifact: design
---

# Design

An administration record is a 0-microAlgo payment to the room mailbox. The transaction sender is the actor. The note carries the parent transaction id, room id, mailbox, epoch, operation, display name, joining rule, owner, admins, members, and subject. Pending requests are derived and are not stored in the note.

Chain order is confirmed round, then intra-round offset, then transaction id bytes. Every operation except a join request must name the current head. Two records that name the same parent have one winner.

Action 5 plaintext is 133 bytes: action, epoch, room id, mailbox, room key, and the administration transaction id. The note is 227 bytes. Create does not authorize a delivery. Add and accept authorize delivery only to the subject. Remove withholds the new key from the subject. Rekey and transfer deliver to every remaining member.
