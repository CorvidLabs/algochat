---
change: python-speaks-the-delta-room-note-and-the-256-member-cap
artifact: docs
---

# Docs

`py/specs/algochat/algochat.spec.md` says `GROUP_MEMBER_MAX` is 256 and `draft_admin` omits the member list.

`py/specs/algochat/context.md` says a new note omits the member list and can name a parent group, and that key deliveries stay separate payments of at most 16.

`py/specs/algochat/testing.md` names the full-list rejection, the 256 fold, and both vectors.

PROTOCOL.md, TEST-VECTORS.md, and `specs/protocol` are unchanged by this change. They already describe the layout.
