---
change: swift-speaks-the-delta-room-note-and-the-256-member-cap
artifact: docs
---

# Docs

`swift/specs/algochat/algochat.spec.md` says `memberMax` is 256, `membersOmitted` is the 65535 sentinel, and `draft` omits the member list.

`swift/specs/algochat/context.md` says room administration drafts delta 0x03 notes, accepts 256 members, and can name a parent room.

`swift/specs/algochat/testing.md` names the omitted member list, the 256 fold, the separate channel roster, and key deliveries of at most 16.

PROTOCOL.md, TEST-VECTORS.md, and `specs/protocol` are unchanged by this change. They already describe the layout.
