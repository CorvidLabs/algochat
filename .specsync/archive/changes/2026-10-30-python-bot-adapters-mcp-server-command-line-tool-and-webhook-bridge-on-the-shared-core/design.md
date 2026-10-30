---
change: python-bot-adapters-mcp-server-command-line-tool-and-webhook-bridge-on-the-shared-core
artifact: design
---

# Design

- `algochat.agent.service.COMMANDS` is the one list of commands. The CLI builds a subparser per command and the MCP server a tool per command from it, so AGENT-1.e holds by construction and a parity test checks it.
- `AgentService` runs a command on one `AgentCore`; the MCP server keeps one for the session, the CLI one per run.
- `WebhookBridge` is a `serve_direct` and `serve_rooms` handler, so only messages the policy allows reach it and replies go through the core's normal posting.
- `reply` and `reply-room` ask the core the same questions `serve_*` does (`is_known_bot`, `room_skip_reason`) before posting.

Design choices that are not confirmed intent, listed for Leif:

- "Authenticated HTTPS" (AGENT-1.c) is https with the default certificate checks plus an HMAC-SHA256 signature (`X-AlgoChat-Signature: sha256=<hex>` over `"<timestamp>." + body`, `X-AlgoChat-Timestamp`, 300 s tolerance) under a shared secret of at least 32 characters from `ALGOCHAT_WEBHOOK_SECRET` or an owner-only file named by `ALGOCHAT_WEBHOOK_SECRET_FILE`. Loopback addresses may use http, and are signed too when a secret is set. `ALGOCHAT_WEBHOOK_CA_FILE` trusts a private CA.
- Proxies from the environment are ignored, redirects refused, credentials in the URL refused, answers capped at 64 KiB and 15 s.
- The webhook answer is `{"reply": "<text>"}`; `null`, an empty body or 204 means no reply.
- The commands are `address`, `publish-keys`, `send`, `read`, `reply`, `rooms`, `read-rooms`, `reply-room`, `declare-commands`, `leave-room` and `serve`. There is no command to post unprompted in a room, so every room post through an adapter is a reply the policy allows, a command list or the leave notice.
- The MCP server speaks JSON-RPC 2.0 over stdio, one message per line, with tools only (no resources or prompts) and no SDK dependency; tool failures are `isError` results.
- The CLI is `algochat-agent` (and `python -m algochat.agent`), prints JSON, and takes network settings from `ALGOCHAT_ALGOD_URL`, `ALGOCHAT_ALGOD_TOKEN`, `ALGOCHAT_INDEXER_URL`, `ALGOCHAT_INDEXER_TOKEN` with no default network. Only keys signed by their account are used.
- `serve` runs a pass every 5 seconds by default, or once with `--once`.
