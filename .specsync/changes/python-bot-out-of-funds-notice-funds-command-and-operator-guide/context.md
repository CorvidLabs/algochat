---
change: python-bot-out-of-funds-notice-funds-command-and-operator-guide
artifact: context
---

# Context

hi/agent.md AGENT-1.d (in the first version the operator hosts the bot), AGENT-3 (the operator funds the bot's wallet, which pays its fees), AGENT-3.a (when fewer than about 100 replies' worth of fees remain, the bot warns once, in the room where it reached that level, until refilled), AGENT-4 (the key lives in an env var or local file and is never committed) and AGENT-9 (no payments or tips in the first version), confirmed by Leif on 2026-10-29. algochat#48 adds the warning and the operator guide. This branch is stacked on feat/agent-adapters (draft PR algochat#55, algochat#47).

Before this change the bot paid fees from its own wallet but had no way to tell anyone it was running out; an empty wallet only showed up as failed sends. Operators had no single guide for hosting, funding and key handling.

A fresh CLI run has no memory, so the "warned already" state must come from the chain: the bot's own notice, and whether money came in after it.

Out of scope: payments and tips (AGENT-9, later), hosted bots, automatic refills, and notices one-to-one.
