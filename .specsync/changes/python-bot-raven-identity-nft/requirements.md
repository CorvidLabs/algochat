---
change: python-bot-raven-identity-nft
artifact: requirements
---

# Requirements

- AGENT-2.a: `make-identity` on the CLI and `make_identity` over MCP give the bot its identity; the bot's own wallet pays the fee and the locked minimum balance.
- AGENT-2.b: a 1-of-1 `RAVEN` asset (decimals 0, manager the bot, no reserve, freeze or clawback) with Raven's ARC-69 note, read back the way Raven reads it.
- AGENT-2.c: the picture is one emoji or an NFT the bot's wallet holds; links, text, several emoji, NFTs it does not hold and non-picture assets are refused; the public name is the bot's `@name` cut to 32 bytes; either changes with an asset config.
- AGENT-2.d: at most one per bot; asking again, from any core or CLI run, updates it.
- AGENT-2.e: the note carries no bot flag, rooms mark bots only by their record, and a bot without an identity works the same.
- AGENT-2.f: signed on the bot's machine; no request carries the mnemonic or the seed.
- Look-alikes made by other accounts are ignored.
- Encoded transactions match `py-algorand-sdk` byte for byte; `cryptography` stays the only runtime dependency.
- Unit tests use public non-secret seeds and an in-memory ledger; localnet tests use throwaway accounts funded only by the local KMD wallet.
