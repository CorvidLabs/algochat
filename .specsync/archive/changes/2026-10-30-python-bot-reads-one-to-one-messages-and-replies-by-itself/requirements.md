---
change: python-bot-reads-one-to-one-messages-and-replies-by-itself
artifact: requirements
---

# Requirements

- AGENT-5: the bot reads one-to-one messages to it and replies with its own account, through the library's own payment path.
- A reply names the message it answers (PROTOCOL.md section 9.2).
- A message is answered at most once, also after the bot restarts.
- Messages written by any implementation are read, and every implementation reads the bot's replies.
- The bot publishes its signed encryption key and only sends to keys `AlgoChat` accepts.
- Tests use public non-secret seeds and no network, except the `localnet` tests, which use throwaway accounts funded only by the local KMD wallet.
