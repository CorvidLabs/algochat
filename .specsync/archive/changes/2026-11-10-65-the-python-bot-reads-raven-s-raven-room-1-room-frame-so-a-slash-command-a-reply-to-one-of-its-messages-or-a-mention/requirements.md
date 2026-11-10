---
change: 65-the-python-bot-reads-raven-s-raven-room-1-room-frame-so-a-slash-command-a-reply-to-one-of-its-messages-or-a-mention
artifact: requirements
---

# Requirements

No requirement text changes. This change makes the Python agent meet requirements that already exist:

- REQ-agent-006: mentions mode answers replies to one of the bot's messages; commands mode answers the commands the bot declared.
- REQ-agent-007 (rooms, AGENT-6): the bot reads and replies in the rooms it is in, which are Raven rooms.
- HI AGENT-8, AGENT-8.d and AGENT-8.f.

The module contract in `py/specs/agent/agent.spec.md` is corrected in place: the `RoomMessage`, `RoomText` and `parse_room_text` rows, the mentions-mode row and invariant 23. `py/specs/agent/testing.md` names the new tests.
