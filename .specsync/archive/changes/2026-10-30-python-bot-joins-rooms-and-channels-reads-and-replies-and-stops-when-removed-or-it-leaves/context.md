---
change: python-bot-joins-rooms-and-channels-reads-and-replies-and-stops-when-removed-or-it-leaves
artifact: context
---

# Context

hi/agent.md AGENT-6 and AGENT-7, with AGENT-7.c (removing the bot is an ordinary removal: the room gets a new key and the bot is dropped from that room's channels), AGENT-7.d (an owner or admin adds the bot and it joins without accepting) and AGENT-7.g (the bot can be in a room's channels, and an admin adds it to each channel separately); leaving is AGENT-7 itself ("My bot can join a room and leave it"), confirmed by Leif on 2026-10-29. algochat#45 adds them to the agent core. This branch is stacked on feat/agent-dm (draft PR algochat#52, algochat#44) and merges feat/room-bot-record (draft PR algochat#51), which adds op 13 ADD_BOT and op 14 SET_BOT.

Before this change the Python agent core only knew one-to-one messages. The library already had section 5.8 rooms (records, reduction, key deliveries, room messages) and hybrid handshakes, but nothing tied them to a bot's account, and `NoteTransaction` had no position inside a round, so records and messages in one round could not be ordered as the protocol requires.

Found while building this: the protocol has no op for a member to remove themselves (op 11 remove is owner or admin only), so the bot cannot leave on chain by itself. Raven reads a member's ML-KEM key only from a signed ACPQ announcement, so the bot must publish one before an owner can hand it a key.

Out of scope: reply modes and rate limits from the room record (algochat#46), MCP, CLI and webhook adapters (algochat#47), the funds warning and operator guide (algochat#48), and a protocol self-leave op (a separate protocol change if wanted).
