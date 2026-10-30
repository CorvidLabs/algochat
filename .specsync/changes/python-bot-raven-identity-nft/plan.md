---
change: python-bot-raven-identity-nft
artifact: plan
---

# Plan

## Approach

Add asset create and config encoding to the library, asset reads to its HTTP clients, and `algochat.agent.identity`, then wire `identity` and `make-identity` through `AgentCore` and the shared command table. Prove it on localnet with throwaway accounts, the way algochat#44 to algochat#48 did.

## Out of scope

Custom picture uploads or links, `.algo` names, deleting an identity, payments and tips, and a protocol change.

## Steps

1. `transaction.py`: `build_asset_create`, `build_asset_config`; `http_clients.py`: asset and pending reads.
2. `agent/identity.py`: note format, emoji check, name rule, picture pointer, reader, mint-or-update.
3. `AgentCore.identity`, `AgentCore.make_identity`; `identity` and `make-identity` commands; exports.
4. Unit tests (`py/tests/test_agent_identity.py`) with algosdk byte comparisons; command count in `test_agent_adapters.py`.
5. Localnet (`py/tests/test_agent_identity_localnet.py`): emoji, held NFT, ARC-19, updates, look-alike, should-reject, room check, CLI and MCP, no key on the wire.
6. Module specs (version 7), hi/agent.md AGENT-2.a to AGENT-2.f, operator guide, README, localnet how-to, native localnet indexer flag.
7. Definition approval, review, verification and finalize are Leif's. They are not recorded by the agent.

## Risks

Raven's current reader needs `media_url`; emoji identities show in Raven once the shared emoji format lands there (the parallel Raven emoji work). An NFT whose picture lives only behind ARC-3 JSON at a long URL may have no pointer that fits 96 bytes and is refused. An indexer that disables `asset-id`/`tx-type` searches cannot read identities (public indexers and AlgoKit enable them).

## Constraints consulted

AGENT-2 and AGENT-2.a to AGENT-2.f in hi/agent.md (confirmed by Leif on 2026-10-30); AGENT-4 (key only in an env var or local file); AGENT-8.c as built in algochat#46 (only the room record marks a bot); AGENT-9 (no payments or tips); AGENT-3/3.a as built in algochat#48 (the low-funds check ignores the locked minimum balance). Leif (2026-10-30): no custom pictures, only an NFT or an emoji. Raven 67b4275 identity-asset.ts, identity-mint.service.ts and asset-metadata.service.ts for the format and discovery. py/AGENTS.md: no SDD approval on a human owner's behalf. `cryptography` stays the only runtime dependency; the protocol spec and root `algochat` exports are untouched. Leif (Oct 29, 2026): test everything on a local network before any push; local network only, accounts funded from its own KMD wallet; no TestNet, MainNet, real wallets or secrets.
