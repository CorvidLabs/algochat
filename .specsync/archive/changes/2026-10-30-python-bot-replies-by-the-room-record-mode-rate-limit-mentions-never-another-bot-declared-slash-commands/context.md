---
change: python-bot-replies-by-the-room-record-mode-rate-limit-mentions-never-another-bot-declared-slash-commands
artifact: context
---

# Context

hi/agent.md AGENT-8 with AGENT-8.b (rate limit), AGENT-8.c (never another bot), AGENT-8.d (mentions), AGENT-8.e (owner or admin changes mode and limit) and AGENT-8.f (the bot declares its slash commands), confirmed by Leif on 2026-10-29. algochat#46 adds them to the agent core. This branch is stacked on feat/agent-rooms (draft PR algochat#53, algochat#45), which merges feat/room-bot-record (draft PR algochat#51, op 13 ADD_BOT and op 14 SET_BOT).

Before this change the bot answered every room message it could open. The room record already carried its mode (1 mentions, 2 every message, 3 commands), replies and seconds, and marked bots, but nothing used them.

Found while building this: section 5.8 defines no default mode, so a bot added as a plain member has none; the protocol has no note for a bot's command list, and Raven shows room text as plain text, so a plain-text list is the one form every client reads today.

Out of scope: MCP, CLI and webhook adapters (algochat#47), the funds warning and operator guide (algochat#48), and a structured command-list note in the protocol (a separate protocol change if wanted).
