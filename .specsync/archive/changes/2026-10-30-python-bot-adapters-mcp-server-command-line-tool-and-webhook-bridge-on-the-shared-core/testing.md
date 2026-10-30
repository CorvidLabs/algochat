---
change: python-bot-adapters-mcp-server-command-line-tool-and-webhook-bridge-on-the-shared-core
artifact: testing
---

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
