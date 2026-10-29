---
change: python-bot-replies-by-the-room-record-mode-rate-limit-mentions-never-another-bot-declared-slash-commands
artifact: design
---

# Design

- `algochat.agent.policy` is pure: section 9 room text, mentions, command calls, the command list and the rate window, with no I/O.
- `AgentCore` reads the bot's entry (`mode`, `replies`, `seconds`) from each room's current reduced state each time it serves, and checks in order: sender marked as a bot, no mode, not mentioned, not a command, rate limit. A skipped message is marked handled and reported in `RoomReply.skipped`.
- The bot's post times come from the chain (block time) and, for posts this core made, its own clock, so a restart keeps the window.

Design choices that are not confirmed intent, listed for Leif:

- Mode and limit are read from the room's current record every time the bot serves, so an op 14 change also covers messages it has not handled yet.
- A bot added as a plain member has no mode and never replies there (section 5.8 has no default mode).
- A mention is `@` plus the bot's name (any case) or its address (exact), not inside an email address or a longer word, or a section 9.2 reply naming one of its messages.
- Commands are declared in operator code (`BotCommand`). In commands mode the bot posts a plain-text list (`Commands for @name:` then `/command - description`) once per change, restart-safe, with no protocol change so every client including Raven reads it. `/help` is built in unless the operator declares `help`. `/command@otherbot` is not for this bot.
- Every post in a room counts toward the limit: replies, `/help` answers and command lists. The leave notice is exempt. Messages over the limit are skipped, not queued, so the bot never answers late in a burst.
- An account any of the bot's rooms marks as a bot is never answered, in rooms and one-to-one.
- The bot's own room replies stay plain text.
