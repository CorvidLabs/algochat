# Lesson bundle: 65-the-python-bot-reads-raven-s-raven-room-1-room-frame-so-a-slash-command-a-reply-to-one-of-its-messages-or-a-mention

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: 65: the Python bot reads Raven's RAVEN:ROOM:1 room frame, so a slash command, a reply to one of its messages, or a mention of it that Raven sends inside the frame is answered as AGENT-8, AGENT-8.d and AGENT-8.f require
- **Kind**: BugFix
- **Paths**: py/src/algochat/agent/, py/tests/, py/specs/agent/, CHANGELOG.md
- **Acceptance**: parse_room_text reads a Raven room frame (U+001E, RAVEN:ROOM:1, a newline, then JSON with text, mentions, optional string replyTo and optional photo) exactly as Raven's decodeRoomContent accepts it: the visible text becomes the message text, a replyTo transaction id becomes reply_to, and each mention's address is kept; any frame Raven would show as plain text (not JSON, not an object, text not a string, mentions not an array or over 100, a replyTo that is not a string reference, a mention with a bad address, non-integer, overlapping, too-short or out-of-range UTF-16 offsets, or a span not starting with @) stays plain text, unchanged. Plain text and section 9.1 and 9.2 JSON read as before. In commands mode a declared /command inside a frame is answered (reply around /ping, reply around /echo hello world, mention frame /echo @account hello, mention plus reply); in mentions mode a frame replying to one of the bot's own messages, or binding a mention to the bot's address, counts as mentioning it, and a frame naming another message or address does not. Regression tests for each row of issue #65's table fail before the fix and pass after, the Python suite and ruff pass, and frames built by Raven's own encodeRoomContent parse as expected. No wire, hi or requirement change; the bot's own replies stay plain text.

## Evidence

- Verification commit: `e45140e3240e6d9d805a00469cd8e3720274dc71`
- Base commit: `98ffe186499eaa7f2769bd5981fd46a70380f384`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

Issue #65, from runtime proof against tag v1.6.0 (`7d7b280`). The released Python agent calls `parse_room_text`, `command_call` and `mentions` on every decrypted room plaintext (`AgentCore._open_room_message`). Raven's `encodeRoomContent` (raven `src/app/core/utils/room-content.ts`, last changed in raven `f586c04b`) leaves bare text unchanged. A reply, a structured mention or a photo instead becomes U+001E, `RAVEN:ROOM:1`, a newline, then compact JSON `{"text","mentions":[{"address","start","end"}],"replyTo"?,"photo"?}`. Here `replyTo` is a string (a 52-character transaction id or a 12-32 character local reference), not section 9.2's `{"txid": ...}`.

`parse_room_text` only unwraps JSON that starts with `{`, so a Raven frame stays literal text:
- In commands mode, `command_call` needs the text to start with `/`, so `/ping` inside a reply frame is dropped as `SKIP_NOT_A_COMMAND`.
- In mentions mode, a Raven reply to the bot's own message is never seen as a reply, because `reply_to` stays `None`.

Bare `/ping` still works, which is why a plain command succeeds and a reply or a structured mention does not. This is the gap behind CorvidLabs/raven#581.

**Why this is a bug fix.** HI AGENT says the bot sits in a Raven group. AGENT-8.d says replying to one of its messages counts as mentioning it, AGENT-8 and AGENT-8.f cover commands mode, and REQ-agent-006 says mentions mode answers "replies to one of the bot's messages". The module spec (`py/specs/agent/agent.spec.md`) narrowed that to section 9.2 replies, and its invariant 23 assumed that Raven shows room text as it is. Raven's frame is the defect's cause. The issue proposes no change to Raven's client, and none is made.

**Authority.** Leif's merge rule of 2026-11-10, relayed by coordinator Claude Code (hc t370), which lists #65 as a bug. Bug fixes that make behaviour match existing specs, requirements or HI may run the full SpecSync lifecycle with 0xLeif as approve and review actor, and squash-merge once CI is green and every review thread is resolved.

**Constraints:**
- No wire, protocol, HI or requirement change.
- The bot's own replies stay plain text.
- Validation mirrors Raven's `decodeRoomContent`: a frame Raven would show as plain text stays plain text for the bot, including UTF-16 mention offsets and the 100-mention cap.
- Raven also drops mentions of addresses that are not members. The bot keeps every well-formed mention address and only asks whether its own address is one of them, which gives the same result for the bot.
- A frame's `photo` is ignored, and its `text` (the caption) is the message text.

**Ruled out:**
- Changing Raven to send section 9.2 replies: that is a Raven decision, and older Raven clients would still send frames.
- Treating any `replyTo` shape inside a frame as valid: Raven itself rejects an object `replyTo`.

The interview's `public_contract` is answered `no`, as in every earlier Python agent change (#43 to #48, #59, and bug fix #63/#64). The root canonical contracts (`specs/protocol`, `specs/release`, `specs/godot`) do not change. The Python agent's own contract does change in one place: it now reads Raven frames. That contract lives in the separate `py/specs/agent` module, which is corrected in place in this PR.

## From the change's testing.md

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

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
