---
change: python-bot-adapters-mcp-server-command-line-tool-and-webhook-bridge-on-the-shared-core
artifact: requirements
---

# Requirements

- AGENT-1.a: an agent plugs in through an MCP server, a command-line tool or a webhook bridge, all three on the same shared core (`AgentCore`).
- AGENT-1.e: every command-line command has an MCP tool with the same parameters.
- AGENT-1.c: the webhook bridge sends readable message text only to the same machine, or to a secured address over authenticated HTTPS.
- The adapters keep the reply policy from algochat#46 (AGENT-8): they never reply where `serve_rooms` would stay silent and never answer another bot.
- No adapter output or error carries the bot's mnemonic or the webhook secret (AGENT-4).
- Every implementation reads the notes the adapters post and reduces the room chain the same way.
- Tests use public non-secret seeds and loopback receivers only, except the `localnet` tests, which use throwaway accounts funded only by the local KMD wallet.
