# Lesson bundle — python-bot-adapters-mcp-server-command-line-tool-and-webhook-bridge-on-the-shared-core

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Python bot adapters: MCP server, command-line tool and webhook bridge on the shared core
- **Kind**: Feature
- **Paths**: py/specs/agent, py/src/algochat/agent, py/tests, py/README.md, py/docs, py/pyproject.toml
- **Acceptance**: AGENT-1.a, AGENT-1.c and AGENT-1.e in hi/agent.md, as scoped by algochat#47: an agent plugs in through an MCP server, a command-line tool or a webhook bridge, all three on the shared Python AgentCore; the MCP server has a tool for every command-line command, with the same parameters; the webhook bridge carries readable message text only to the same machine or to a secured address over authenticated HTTPS; replies through every adapter keep the existing reply policy (AGENT-8) and no output carries the bot's key (AGENT-4); on localnet the real CLI and MCP server processes publish keys, read and answer one-to-one and room messages written by TypeScript, Go, Rust, Python and Kotlin, refuse what the policy keeps silent, serve a signed loopback webhook, post a command list and leave, and every implementation including Swift (through the recorded-notes swift test on Linux) opens the bot's notes and reduces the room chain; unit tests use public non-secret seeds and loopback receivers only; localnet tests use throwaway accounts funded only from the local KMD wallet.

## Evidence

- Verification commit: `eac707e45abcdd67fc015ad5698f883b883983e8`
- Base commit: `49b8cc215eca16862c600f78fb4aa9169573c8ca`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

hi/agent.md AGENT-1.a (MCP server, command-line tool or webhook bridge, all on the same shared core), AGENT-1.c (the webhook bridge may carry readable text only to the same machine or a secured address over authenticated HTTPS) and AGENT-1.e (in the first version, the MCP server has a tool for every command-line command), confirmed by Leif on 2026-10-29. algochat#47 adds them. This branch is stacked on feat/agent-reply-policy (draft PR algochat#54, algochat#46).

Before this change an operator could only use the bot by writing Python against `AgentCore`. There was no command, no MCP server and no way to hand messages to a service in another language.

Found while building this: a fresh `AgentCore` that answered one-to-one messages before reading its rooms did not yet know which senders were bots; that fix went into algochat#46 (49b8cc2) and this branch includes it. A fresh CLI process starts with no memory, so `reply` and `reply-room` read again to find the message by transaction id.

Out of scope: the out-of-funds warning and the operator guide (algochat#48), hosted bots (AGENT-1.d says self-hosted first), an MCP transport other than stdio, and posting unprompted in rooms through the adapters.

## From the change's design.md

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

## From the change's testing.md

# Testing

Unit tests use public non-secret seeds, the in-memory chain, and receivers on 127.0.0.1 only (a self-signed certificate for the HTTPS cases).

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| AGENT-1.e parity | `py/tests/test_agent_adapters.py::test_every_cli_command_has_an_mcp_tool_with_the_same_parameters` compares the CLI parser's subcommands and flags with `tools/list`, both ways. |
| AGENT-1.a MCP | `test_mcp_initialize_list_and_errors`, `test_mcp_serves_lines_over_stdio_and_reports_parse_errors`, `test_address_and_unknown_commands`. |
| AGENT-1.a CLI | `test_cli_reports_missing_settings_without_leaking_the_key`, `test_cli_rejects_a_bad_command_declaration`; the localnet test runs the real command. |
| AGENT-1.c webhook | `test_readable_text_only_goes_to_this_machine_or_a_secured_https_address` (loopback http and https, plain http elsewhere refused, https elsewhere only with a secret, credentials, `file://`, link-local, unspecified, IPv4-mapped and cloud metadata hosts refused), `test_the_bridge_refuses_unsafe_urls_with_the_reason` (the bridge itself refuses plain http to a public host and name, `file://`, userinfo, metadata and no secret, with the reason), `test_a_redirect_is_refused_and_its_target_never_called` (exact text `The webhook answered with a redirect, which the bridge does not follow`; the target gets nothing), `test_signatures_and_timestamps`, `test_the_secret_comes_from_one_place_and_is_long_enough`, `test_the_bridge_signs_requests_and_reads_replies` (signed, environment proxy ignored), `test_webhook_answers` (204, empty, null, errors, a redirect and an oversize body refused), `test_https_checks_the_certificate`. |
| AGENT-8 through the adapters | `test_mcp_room_tools_follow_the_rooms_reply_policy` (not mentioned, another bot and the rate limit refused; a mention answered), `test_reply_refuses_a_one_to_one_message_from_a_room_bot`, `test_serve_sends_only_what_the_policy_allows_to_the_webhook`, `test_send_refuses_an_account_a_room_marks_as_a_bot` (a fresh service, nothing posted), `test_a_long_lived_service_reads_the_rooms_again_before_replying` (one `AgentService`: op 14 to commands mode after `read-rooms` makes `reply-room` refuse; op 12 marking a one-to-one sender as a bot after `read` makes `reply` refuse, nothing posted). |
| On a real network, every language | `py/tests/test_agent_adapters_localnet.py::test_cli_mcp_and_webhook_on_localnet_across_every_language`: the real `algochat-agent` CLI and MCP server run as processes with the mnemonic only in their environment. The CLI publishes the keys once, lists the room (mentions, 4 per 60 s), reads one-to-one messages with the other bot marked, answers the person and refuses the other bot. TypeScript, Go and Rust write room messages; over MCP, `tools/list` has all 11 tools, `read_rooms` reports `not-mentioned`, none and `from-bot`, `reply_room` refuses the first and last and answers the mention. `serve --once` with a signed loopback webhook sends it only the person's one-to-one message and a Kotlin-written mention (no bad signatures), skips a Python-written unmentioned message and the other bot, and posts both answers. After op 14 to commands mode, `declare-commands` posts the list; `leave-room` posts the notice, the test waits for it on the indexer, and `rooms` shows `left`. Every implementation opens every bot and person note and reduces the chain; Swift does the same through `swift test --filter AgentRoomsLocalnetTests`, which must run. No CLI or MCP output carries any form of the key. |

## Localnet run

Local network only (`py/docs/localnet-testing.md`), Linux x86_64, `py/scripts/native-localnet.sh` layout (go-algorand dev mode, kmd, conduit, indexer, PostgreSQL), AlgoKit ports and token. Tools built as `py/tests/cross_tools.py` describes; Swift 6.0.3, JDK 17, Go, Rust, Bun.

```
cd py
ALGOCHAT_LOCALNET_ALGOD_DATA=<localnet>/net/data ALGOCHAT_REQUIRE_LOCALNET=1 python -m pytest
```

Results are recorded in the pull request.

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
