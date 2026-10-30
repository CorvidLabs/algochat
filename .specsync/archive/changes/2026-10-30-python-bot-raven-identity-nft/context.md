---
change: python-bot-raven-identity-nft
artifact: context
---

# Context

hi/agent.md AGENT-2 (the bot has its own wallet and its own Raven identity NFT) and its sub-criteria AGENT-2.a to AGENT-2.f, which Leif confirmed on 2026-10-30 (algochat#59): the operator gives the bot its identity NFT from the command line or MCP and the bot's wallet pays (a); it is the same kind of identity NFT a person makes in Raven (b); its picture is an NFT its wallet holds or an emoji, its public name its `@name`, and either can change later without a second NFT (c); only one per bot, and asking again updates it (d); having it never makes an account a bot, and a bot without one still works (e); the bot's 25 words never leave its machine to make it (f). Leif also ruled out custom pictures: only an NFT or an emoji.

Before this change the bot had a wallet but no identity: Raven showed it as a bare address. A person makes an identity in Raven's UI; a bot has no UI, and its key must stay on its host.

Raven (commit 67b4275) defines the format: a 1-of-1 asset, unit `RAVEN`, named after the `.algo` name or `Raven identity`, managed by the account, no reserve, freeze or clawback, with an ARC-69 note under `properties.raven`; updates are asset configs with a new note; Raven finds the newest undeleted `RAVEN` asset the account created and the newest note that account sent naming its own address. The emoji picture (`picture: "emoji"`, `emoji`, no `media_url`) is the format shared with the Raven emoji-avatar work.

Out of scope: custom image uploads or links, `.algo` names, payments or tips (AGENT-9), and any protocol change.
