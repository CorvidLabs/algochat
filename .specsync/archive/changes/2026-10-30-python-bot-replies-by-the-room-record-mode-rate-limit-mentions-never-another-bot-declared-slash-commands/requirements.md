---
change: python-bot-replies-by-the-room-record-mode-rate-limit-mentions-never-another-bot-declared-slash-commands
artifact: requirements
---

# Requirements

- AGENT-8: in each room the bot replies only in the mode the room's record holds for it: mentions, every message, or commands.
- AGENT-8.b: it posts at most the record's replies in any window of the record's seconds, also across a restart; a message over the limit is skipped, not queued.
- AGENT-8.c: it never answers an account a room's record marks as a bot, in rooms or one-to-one.
- AGENT-8.d: in mentions mode, `@` and its name or address, and a reply to one of its messages, are mentions.
- AGENT-8.e: a mode or limit change by the owner or an admin (op 14) applies from the next message it handles.
- AGENT-8.f: the bot declares its own slash commands; in commands mode it posts the list once (again only when it changes) and answers `/help` with it.
- A bot added as a plain member has no mode and stays silent.
- Every implementation reads the bot's notes and reduces the room chain with its mode and limit the same way.
- Tests use public non-secret seeds, a fake clock and no network, except the `localnet` tests, which use throwaway accounts funded only by the local KMD wallet.
