---
id: 65-the-python-bot-reads-raven-s-raven-room-1-room-frame-so-a-slash-command-a-reply-to-one-of-its-messages-or-a-mention
state: implementing
type: bug_fix
base_commit: 98ffe186499eaa7f2769bd5981fd46a70380f384
---

# 65: the Python bot reads Raven's RAVEN:ROOM:1 room frame, so a slash command, a reply to one of its messages, or a mention of it that Raven sends inside the frame is answered as AGENT-8, AGENT-8.d and AGENT-8.f require

## Intent

65: the Python bot reads Raven's RAVEN:ROOM:1 room frame, so a slash command, a reply to one of its messages, or a mention of it that Raven sends inside the frame is answered as AGENT-8, AGENT-8.d and AGENT-8.f require

## Affected Canonical Specs

- None

## Acceptance Criteria

- parse_room_text reads a Raven room frame (U+001E, RAVEN:ROOM:1, a newline, then JSON with text, mentions, optional string replyTo and optional photo) exactly as Raven's decodeRoomContent accepts it: the visible text becomes the message text, a replyTo transaction id becomes reply_to, and each mention's address is kept; any frame Raven would show as plain text (not JSON, not an object, text not a string, mentions not an array or over 100, a replyTo that is not a string reference, a mention with a bad address, non-integer, overlapping, too-short or out-of-range UTF-16 offsets, or a span not starting with @) stays plain text, unchanged. Plain text and section 9.1 and 9.2 JSON read as before. In commands mode a declared /command inside a frame is answered (reply around /ping, reply around /echo hello world, mention frame /echo @account hello, mention plus reply); in mentions mode a frame replying to one of the bot's own messages, or binding a mention to the bot's address, counts as mentioning it, and a frame naming another message or address does not. Regression tests for each row of issue #65's table fail before the fix and pass after, the Python suite and ruff pass, and frames built by Raven's own encodeRoomContent parse as expected. No wire, hi or requirement change; the bot's own replies stay plain text.

## No-spec Rationale

The wire format and the root protocol, release and godot specs do not change. The Python agent module spec (py/specs/agent) is corrected in place, as #64 did, so parse_room_text and mentions mode name the Raven frame; hi AGENT-* and the agent requirements are unchanged.
