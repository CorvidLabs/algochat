---
change: hold-every-language-to-the-channel-rules-and-the-256-member-cap
artifact: context
---

# Context

Leif confirmed on 28 October 2026 that the shared cross-language room-note tests must reject the channel rules and the 256-member cap before the room-notes branch merges. Examples are a forged channel action and a 257th member.

GROUP-8.b already says a room holds 256 people. GROUP-9 already says a channel is another room, the group owner creates it, and the owner keeps it. This change does not add a protocol rule. It puts those rejects in `vectors/group-admin-delta-v1.json` and makes each language's delta test walk `draft_errors`, including a parent room when the case has one.

The wire layout stays the delta note. No second layout is introduced.
