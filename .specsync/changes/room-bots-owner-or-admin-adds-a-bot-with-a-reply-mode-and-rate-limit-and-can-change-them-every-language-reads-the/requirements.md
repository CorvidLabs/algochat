---
change: room-bots-owner-or-admin-adds-a-bot-with-a-reply-mode-and-rate-limit-and-can-change-them-every-language-reads-the
artifact: requirements
---

# Requirements

- AGENT-7.a, AGENT-8.a, AGENT-8.b: only the owner or an admin adds a bot (op 13), and the add carries the bot mark, a reply mode and a rate limit. There is no default; 5 replies per 60 seconds is a suggested preset.
- AGENT-7.b: a flag someone sets on their own identity never makes them a bot. A self-sent op 13 is rejected, and a join request never makes a bot.
- AGENT-7.d: the bot joins as soon as op 13 is accepted, with no accept or decline. The epoch stays, and op 13 authorizes the current key's delivery to the bot.
- AGENT-7.e: a bot cannot be appointed admin, and cannot receive ownership.
- AGENT-7.f: an account is marked only when added. Op 13 naming an existing member is rejected.
- AGENT-7.g: a channel adds the bot with its own op 13, only if the account is a bot in the parent room. A plain channel add of a parent bot is rejected.
- AGENT-8.e: the owner or an admin changes a bot's mode and limit at any time (op 14).
- AGENT-10, AGENT-10.a: the room record holds the mark, mode and limit, and TypeScript, Go, Rust, Python, Kotlin and Swift read and check it the same way.
