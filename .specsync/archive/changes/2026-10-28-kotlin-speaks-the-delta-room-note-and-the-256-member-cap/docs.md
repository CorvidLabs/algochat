---
change: kotlin-speaks-the-delta-room-note-and-the-256-member-cap
artifact: docs
---

# Docs

`kt/specs/protocol/protocol.spec.md` says a new 0x03 note omits the member list, `MEMBER_MAX` is 256, and a channel names its parent group. These are the Kotlin module notes. The canonical protocol spec is unchanged.

`kt/specs/protocol/context.md` says a new note records one subject and omits the member list, and that a channel names the parent group id.

`kt/specs/protocol/testing.md` names the full-list rejection, the 256 fold, the separate channel roster, and both vectors.

PROTOCOL.md, TEST-VECTORS.md, and `specs/protocol` are unchanged by this change. They already describe the layout.
