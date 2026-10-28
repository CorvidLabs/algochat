---
change: rust-speaks-the-delta-room-note-and-the-256-member-cap
artifact: docs
---

# Docs

`rs/specs/crate/crate.spec.md` says a new 0x03 note omits the member list, a room holds 256 members, and a channel names its parent room.

`rs/specs/crate/context.md` says room administration drafts omit the member list so a room can hold 256 people.

`rs/specs/crate/testing.md` names the full-list rejection, the 256 fold, the channel roster, the resumed key payment, and both vectors.

PROTOCOL.md, TEST-VECTORS.md, and `specs/protocol` are unchanged by this change. They already describe the layout.
