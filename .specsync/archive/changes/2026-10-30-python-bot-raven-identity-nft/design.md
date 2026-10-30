---
change: python-bot-raven-identity-nft
artifact: design
---

# Design

- `algochat.transaction` gains hand-written `build_asset_create` and `build_asset_config` (canonical msgpack, empty fields dropped), signed by the existing `sign_payment`; `cryptography` stays the only runtime dependency, and tests compare bytes and ids with `py-algorand-sdk`.
- `HttpAlgodClient` gains `pending_transaction` (the created asset id after confirmation), `account_created_assets`, `asset_holding`, `asset_params`; `HttpIndexerClient` gains `account_created_assets` and `asset_config_history`.
- `algochat.agent.identity` holds the note format, the emoji check, Raven's name rule, the NFT picture pointer, the reader and the send. `AgentCore.identity` and `AgentCore.make_identity` use it; `identity` and `make-identity` join the shared command table, so the CLI and MCP get both.
- One per account: algod (no indexer lag) decides mint or update; the reader follows Raven on the indexer.

Design choices that are not confirmed intent, listed for Leif:

- The asset name is always `Raven identity` (a bot has no `.algo` name); an emoji identity has an empty asset URL.
- The NFT picture link comes from the NFT's on-chain URL with no fetch: ARC-19 templates resolve to their CID, IPFS links are normalized to `ipfs://`, other image or media links are kept when they fit 96 bytes. An asset Raven would not count as a picture NFT (0 decimals and total 1, or up to 100000 with a media URL), one the bot does not hold, or the bot's own identity is refused.
- Commands: `identity` (show it as Raven reads it) and `make-identity --emoji X | --nft ID` (mint, or update when one exists). No separate update command. With no picture and an existing identity it keeps the picture (an NFT must still be held) and refreshes the name; a bot without `--name` keeps the name on its identity.
- Before sending, the wallet must cover the fee, plus the 0.1 ALGO minimum balance a new asset locks.
- The low-funds logic is unchanged: it already counts only the balance above the minimum balance, so the locked 0.1 ALGO is left out, and identity fees are not counted toward a refill (errs toward no false refill).
- The native localnet script runs the indexer with `--enable-all-parameters`, as AlgoKit's localnet does, so the `asset-id` and `tx-type` searches Raven uses work.
