---
change: 65-the-python-bot-reads-raven-s-raven-room-1-room-frame-so-a-slash-command-a-reply-to-one-of-its-messages-or-a-mention
artifact: testing
---

# Testing

- Red first: the new tests fail at the base commit in `parse_room_text`, in commands mode and in mentions mode.
- Green: `python3 -m pytest tests/` in `py/` (non-LocalNet tests) and `ruff check src/ tests/`.
- Issue #65's table, row by row, through `AgentCore.serve_rooms` on the in-memory chain:
  - bare `/ping` and `/echo hello world` are answered;
  - a reply frame around `/ping` and around `/echo hello world` is answered, with `reply_to` set;
  - the mention frame `/echo @account hello` is answered;
  - the mention frame plus a reply is answered, with `reply_to` set;
  - section 9.2 `{"text":"/ping hi","replyTo":{"txid":...}}` is answered as before.
- Mentions mode:
  - a frame whose `replyTo` is one of the bot's own txids is answered;
  - a frame binding a mention to the bot's address, with visible text that is not the bot's name, is answered;
  - a frame replying to another member's message, or mentioning another member, is skipped as `SKIP_NOT_MENTIONED`.
- Invalid frames stay plain text, one case per rule in Raven's `decodeRoomContent`.
- UTF-16 mention offsets after a character outside the Basic Multilingual Plane are accepted.
- Cross-implementation: frames written by Raven's `encodeRoomContent` (bun, from the raven checkout) parse in Python to the same text, `replyTo` and mention addresses.
- `fledge lanes run verify` and `fledge trust verify`. Hosted: the Python lane and the other checks green on the PR head.
