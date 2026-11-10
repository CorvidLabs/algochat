---
change: 65-the-python-bot-reads-raven-s-raven-room-1-room-frame-so-a-slash-command-a-reply-to-one-of-its-messages-or-a-mention
artifact: context
---

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
