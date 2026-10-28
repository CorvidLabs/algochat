---
change: go-speaks-the-delta-room-note-and-the-256-member-cap
artifact: docs
---

# Docs

`go/specs/algochat/algochat.spec.md` says `DraftAdmin` omits the member list, one room holds 256 members, and a channel names its parent room. `ReduceAdmin` still reduces a full-list note and takes the parent timeline for a channel.

`go/specs/algochat/context.md` says a new note records one subject plus a parent group id, and that key deliveries are separate payments of at most 16.

`go/specs/algochat/testing.md` names the full-list rejection, the 256 fold, both vectors, the channel roster, and the resumed key payment.

PROTOCOL.md, TEST-VECTORS.md, and `specs/protocol` are unchanged by this change. They already describe the layout.
