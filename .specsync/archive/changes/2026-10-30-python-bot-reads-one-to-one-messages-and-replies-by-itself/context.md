---
change: python-bot-reads-one-to-one-messages-and-replies-by-itself
artifact: context
---

# Context

hi/agent.md AGENT-5 (confirmed by Leif on 2026-10-29): the bot reads one-to-one messages to it and replies. algochat#44 adds that on the agent core from algochat#43 (this branch is stacked on feat/agent-core, draft PR algochat#49). The ticket also asks that sending move into the library, so the bot replies with its own account and the localnet tests use the same path.

Before this change the Python library had no way to build or submit a transaction: the localnet tests from algochat#43 carried their own msgpack encoder and HTTP clients. `AlgoChat.process_transaction` dropped the reply context of a section 9.2 reply, so a bot could not tell which messages it had already answered.

Found on localnet while building this: the indexer lists an address's transactions newest first, so paging by round alone would have skipped older messages. The HTTP indexer client now follows the indexer's next tokens.

Out of scope: rooms and channels (algochat#45), reply policy (algochat#46), MCP, CLI and webhook adapters (algochat#47), the funds warning and operator guide (algochat#48).
