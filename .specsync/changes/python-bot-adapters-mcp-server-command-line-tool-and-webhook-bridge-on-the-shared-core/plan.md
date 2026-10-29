---
change: python-bot-adapters-mcp-server-command-line-tool-and-webhook-bridge-on-the-shared-core
artifact: plan
---

# Plan

## Approach

Put one table of shared commands (`algochat.agent.service.COMMANDS`) over `AgentCore`, and build both the CLI subcommands and the MCP tools from it, so they match by construction. The webhook bridge is an async handler for the existing `serve_direct` and `serve_rooms`, so it inherits the reply policy. Prove it on localnet by running the real CLI and MCP server as processes against messages written by every implementation, the way algochat#44 to algochat#46 did.

## Out of scope

The out-of-funds warning and operator guide (algochat#48), hosted bots, MCP transports other than stdio, an MCP SDK dependency, and a command to post unprompted in rooms.

## Steps

1. `config.read_owner_only_file` for the mnemonic and the webhook secret; `AgentCore.room_skip_reason` and `is_known_bot`.
2. `algochat.agent.webhook`: URL rules, HMAC-SHA256 signature over a timestamp and the body, secret loading, `WebhookBridge`, `verify_signature` for receivers.
3. `algochat.agent.service`: `Param`, `AgentCommand`, `AgentService`, the 11 commands, policy refusals in `reply` and `reply-room`.
4. `algochat.agent.runtime` (settings from the environment, no default network), `algochat.agent.mcp` (stdio JSON-RPC), `algochat.agent.cli` and `__main__`; the `algochat-agent` script in pyproject.
5. Unit tests: parity, MCP protocol, policy refusals, URL rules, signatures, secret loading, the bridge against loopback HTTP and HTTPS receivers, `serve` through the bridge, CLI errors without the key.
6. Localnet: the CLI and MCP server as processes; TypeScript, Go, Rust, Python and Kotlin write messages; every tool opens every bot note and reduces the chain; Swift replays it through `swift test --filter AgentRoomsLocalnetTests`; no output carries the key.
7. Module specs (version 5), README, localnet how-to.
8. Definition approval, review, verification and finalize are Leif's. They are not recorded by the agent.

## Risks

A webhook URL on another machine without a checked certificate would leak text; the bridge requires https with the default certificate checks and a secret there. A receiver that skips `verify_signature` accepts forged requests; the README shows how to check it. A CLI run per message re-reads the chain, so it is slower than one long-running `serve` or MCP session. A message skipped by the policy stays visible to `read-rooms` in later fresh runs until the bot posts again in that room, with its skip reason.

## Constraints consulted

AGENT-1.a, AGENT-1.c, AGENT-1.e and AGENT-4 in hi/agent.md; AGENT-8 as built in algochat#46. py/AGENTS.md: no SDD approval on a human owner's behalf. `cryptography` stays the only runtime dependency (the MCP server and the bridge use the standard library). No real mnemonics, wallets or public-network calls in tests; the CLI has no default network. Leif (Oct 29, 2026): test everything on a local network before any push; local network only, accounts funded from its own KMD wallet.
