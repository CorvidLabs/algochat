---
change: python-agent-core-for-a-self-hosted-bot
artifact: plan
---

# Plan

## Approach

Add the subpackage `algochat.agent` in py/ (account, config, core) with its own module spec in py/specs/agent. Build the chat client with the existing `AlgoChat.from_seed`. Do not change the protocol spec, the vectors, or the root `algochat` exports.

## Out of scope

Replies, rooms, channels, removal, reply policy, the MCP server, CLI, webhook bridge, the funds warning, and the operator guide (algochat#44 to #48). Falcon accounts.

## Steps

1. Decode the 25-word mnemonic with a bundled BIP-39 English word list, so `cryptography` stays the only runtime dependency.
2. Load the mnemonic from the env var, the file env var, or an explicit path, refusing unsafe files.
3. Add `AgentCore` bound to the bot's own account.
4. Add the module spec, README section, and ignore patterns.
5. Definition approval and review are Leif's. They are not recorded by the agent.

## Risks

The decoder is a reimplementation; fixed vectors and an optional algosdk cross-check guard it. The owner-only file rule refuses Kubernetes-style 0644 secret mounts.
