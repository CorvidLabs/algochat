---
change: python-bot-joins-rooms-and-channels-reads-and-replies-and-stops-when-removed-or-it-leaves
artifact: requirements
---

# Requirements

- AGENT-7.d: an owner or admin adds the bot (op 13, or a member add) and it joins as soon as an authorized key reaches it, with no request or accept.
- A key is used only when the room's accepted records authorize its sender to deliver it to the bot, at that epoch.
- AGENT-6, AGENT-7: the bot reads room messages in chain order and replies with its own account; each message is answered at most once, also after a restart; nothing from before it joined is answered.
- AGENT-7.g: the same in channels, each added separately by an admin; a channel key is used only once the bot is in the parent room.
- AGENT-7.c: removal is an ordinary removal; after it the bot stops in the room and its channels.
- AGENT-7: the bot can leave, and stays out after a restart.
- Messages written by any implementation are read, and every implementation reads the bot's room notes and reduces the room chains the same way.
- Tests use public non-secret seeds and no network, except the `localnet` tests, which use throwaway accounts funded only by the local KMD wallet.
