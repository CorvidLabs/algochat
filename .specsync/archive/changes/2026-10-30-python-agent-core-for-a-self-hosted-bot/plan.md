---
change: python-agent-core-for-a-self-hosted-bot
artifact: plan
---

# Plan

## Approach

Add the subpackage `algochat.agent` in py/ (account, config, core) with its own module spec in py/specs/agent. Build the chat client with the existing `AlgoChat.from_seed`. Do not change the protocol spec, the vectors, or the root `algochat` exports.

## Out of scope

Replies, rooms, channels, removal, reply policy, the MCP server, CLI, webhook bridge, the funds warning, and the operator guide (algochat#44 to #48). Falcon accounts.

### AGENT-2 identity NFT

AGENT-2 has two halves: the bot's own Algorand wallet, and the bot's own Raven identity NFT, which does not make it a bot. This change builds only the wallet (the Ed25519 account). The identity NFT half is out of scope and AGENT-2 is not marked fully done here.

No issue in tracker algochat#39 clearly owns minting or attaching the bot's Raven identity NFT. AGENT-2 is listed only on algochat#43 (this change), and none of algochat#41 to #48 or raven#578 to #583 covers issuing it. raven#579 covers the related display rule (Raven ignores any self-set bot flag on the identity NFT's ARC-69 note and reads the bot mark only from the room record), which is AGENT-7.b's side, not issuing the NFT. The owner of the identity NFT half needs to be decided in algochat#39; this change does not file a new issue.

## Steps

1. Decode the 25-word mnemonic with a bundled BIP-39 English word list, so `cryptography` stays the only runtime dependency.
2. Load the mnemonic from the env var, the file env var, or an explicit path, refusing unsafe files.
3. Add `AgentCore` bound to the bot's own account.
4. Add the module spec, README section, and ignore patterns.
5. Prove it on a local Algorand network before every push: localnet integration tests, skipped without a localnet so CI stays green, plus a Docker-free localnet script and a how-to.
6. Definition approval and review are Leif's. They are not recorded by the agent.

## Risks

The decoder is a reimplementation; fixed vectors and an optional algosdk cross-check guard it. The owner-only file rule refuses Kubernetes-style 0644 secret mounts.

## Constraints consulted

AGENT-1, AGENT-1.b, AGENT-1.d, AGENT-2 and AGENT-4 in hi/agent.md. py/AGENTS.md: no SDD approval on a human owner's behalf. The py package keeps `cryptography` as its only runtime dependency. No real mnemonics, wallets, or public-network calls in tests. Leif (Oct 29, 2026): test everything end to end on a local network before any push; local network only, accounts funded from its own KMD wallet, no TestNet or MainNet.
