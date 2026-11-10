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

## Evidence

Local, 2026-11-10, macOS arm64, Python 3.14.6, pytest 9.1.1, bun 1.4.0, ruff from Homebrew.

- Red at cb55a65 (base 98ffe18 plus the new tests): `PYTHONPATH=src pytest tests/test_agent_policy.py` gave 4 failed and 57 passed.
  - `test_room_text_reads_raven_frames`: the frame stayed literal text.
  - `test_a_frame_with_more_than_100_mentions_stays_plain_text`.
  - `test_commands_mode_answers_a_command_raven_sends_inside_its_frame`: reply and mention frames were skipped as `not-a-command`.
  - `test_mentions_mode_counts_a_raven_reply_or_mention_aimed_at_the_bot`: a Raven reply to the bot's own message was skipped as `not-mentioned`.
  - The 26 invalid-frame cases already passed at base, because nothing parsed frames.
- Green after the fix: `test_agent_policy.py` 61 passed. A later review pass added `test_a_deeply_nested_frame_is_plain_text_not_an_error`: a frame nested 100000 deep raised `RecursionError` without the fix and is plain text with it, as JavaScript's `JSON.parse` gives Raven a plain-text array there. A note the bot opens holds at most 4026 bytes, about 2000 levels, which Python 3.12 to 3.14 parse without error. With that test, 62 passed. Full suite `pytest tests/`: 676 passed and 207 skipped (677 passed after the nesting test) (the skips are LocalNet tests, with no LocalNet running). `test_agent_identity.py` and `test_agent_identity_localnet.py` were left out locally, because the local venv lacks `msgpack`; neither is touched by this change, and hosted CI installs `.[dev]`.
- `ruff check src/ tests/`: no findings in the changed files. The 19 findings in untouched files are the same on origin/main. The changed files were already not `ruff format`-clean on main; the existing style is kept.
- Cross-implementation, against raven checkout 40f6c538 (room-content.ts unchanged from raven origin/main f586c04b), with Raven's own `encodeRoomContent` and `decodeRoomContent` run under bun. Python `parse_room_text` agreed on all 50 values and differed on none:
  - 8 frames Raven encoded (issue #65's rows and a UTF-16 case);
  - 42 values Raven decoded, including every invalid-frame case above, lone surrogates, duplicate keys, `1e400`, `NaN`, a lowercase address and the 101-mention cap.

  Raven's frame size cap there is `MAX_MULTIPART_ASCII_BYTES` = 186720, larger than any one room note. The scripts were kept outside the repository.
- `specsync check` (root): passed. `specsync check` in `py/`: the same 58 findings before and after this change. `hi check`: 181 criteria in 16 families.
