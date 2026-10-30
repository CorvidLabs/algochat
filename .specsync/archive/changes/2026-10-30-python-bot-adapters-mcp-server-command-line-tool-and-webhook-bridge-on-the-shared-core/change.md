---
id: python-bot-adapters-mcp-server-command-line-tool-and-webhook-bridge-on-the-shared-core
state: archived
type: feature
base_commit: 49b8cc215eca16862c600f78fb4aa9169573c8ca
---

# Python bot adapters: MCP server, command-line tool and webhook bridge on the shared core

## Intent

Python bot adapters: MCP server, command-line tool and webhook bridge on the shared core

## Affected Canonical Specs

- None

## Acceptance Criteria

- AGENT-1.a, AGENT-1.c and AGENT-1.e in hi/agent.md, as scoped by algochat#47: an agent plugs in through an MCP server, a command-line tool or a webhook bridge, all three on the shared Python AgentCore; the MCP server has a tool for every command-line command, with the same parameters; the webhook bridge carries readable message text only to the same machine or to a secured address over authenticated HTTPS; replies through every adapter keep the existing reply policy (AGENT-8) and no output carries the bot's key (AGENT-4); on localnet the real CLI and MCP server processes publish keys, read and answer one-to-one and room messages written by TypeScript, Go, Rust, Python and Kotlin, refuse what the policy keeps silent, serve a signed loopback webhook, post a command list and leave, and every implementation including Swift (through the recorded-notes swift test on Linux) opens the bot's notes and reduces the room chain; unit tests use public non-secret seeds and loopback receivers only; localnet tests use throwaway accounts funded only from the local KMD wallet.

## No-spec Rationale

The protocol spec and vectors do not change. The MCP server, CLI and webhook bridge are Python adapters on the existing agent core and send only the section 5.8 room notes and section 9.2 replies the core already sends. The Python module specs under py/specs are updated in place. Wire bytes are untouched.
