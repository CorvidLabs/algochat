---
change: 65-the-python-bot-reads-raven-s-raven-room-1-room-frame-so-a-slash-command-a-reply-to-one-of-its-messages-or-a-mention
artifact: tasks
---

# Tasks

- [x] Failing tests first in `py/tests/test_agent_policy.py`:
  - `parse_room_text` on Raven frames, valid and invalid;
  - commands mode answering a `/command` inside reply and mention frames;
  - mentions mode answering a Raven reply to the bot's own message, and a mention bound to its address, but not a reply or mention aimed elsewhere.
- [x] `policy.py`: read the Raven frame in `parse_room_text` with Raven's validation; `RoomText` gains the frame's mention addresses.
- [x] `core.py`: a frame mention bound to the bot's address counts as mentioning it.
- [x] Update `py/specs/agent` (spec and testing), `py/README.md`, `py/docs/run-your-own-bot.md` and `CHANGELOG.md`.
- [x] Run the Python suite and ruff, cross-check frames written by Raven's own `encodeRoomContent` (bun), run `fledge lanes run verify` and `fledge trust verify`, and record the evidence.
- [x] Open the PR, wait for hosted checks, and resolve review threads before merging.
