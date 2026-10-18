---
change: public-room-administration-on-the-group-mailbox-with-the-same-rules-in-every-language
artifact: context
---

# Context

People want rooms they can own: a small invite-only team and a larger room people ask to join. Anyone can create either kind. A room does not come with an NFT. A payment signature is not a promotion, and the mailbox spending key is not ownership.

The rules were captured as Human Intent GROUP-1 through GROUP-7, and REPO-2 was updated in place so protocol 0x03 is the public room administration record. Tag v1.3.0 still does not include 0x03, 0x06, or 0x07.

Legacy 0x06 actions 1–4 and 0x07 notes stay readable and do not grow an owner. A join request does not advance the room head, so many people can ask against one roster. A request that names a roster that is no longer current is rejected.
