---
change: python-bot-out-of-funds-notice-funds-command-and-operator-guide
artifact: testing
---

# Testing

Unit tests use public non-secret seeds and the in-memory chain from `test_agent_direct.py` with a wallet balance that each send pays its fee from.

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| Threshold (AGENT-3.a) | `py/tests/test_agent_funds.py::test_threshold_is_100_replies_of_the_largest_note_above_the_minimum_balance`. |
| Once, in that room, until refilled (AGENT-3.a) | `test_notice_once_in_the_room_where_funds_ran_low_until_refilled`, `test_the_notice_is_not_held_back_by_the_rate_limit`, `test_a_direct_reply_counts_a_refill_but_the_notice_only_goes_in_a_room`, `test_a_command_list_post_that_crosses_the_line_warns_in_its_own_room` (the list in room A crosses; the notice is in A, the reply in B has none), `test_declare_commands_returns_the_notice_after_the_list_that_crossed`, `test_a_leave_that_crosses_the_line_warns_in_that_room_before_the_bot_is_left` (leave notice then the warning in that room, status `left`, no second notice elsewhere), `test_the_notice_counts_toward_the_rate_limit_after_it_posts`. |
| Survives restarts and CLI runs | `test_fresh_runs_see_a_refill_on_chain_like_separate_cli_calls`. |
| Never blocks a reply | `test_a_failed_balance_read_never_blocks_the_reply`. |
| Reserved text, adapters | `test_the_notice_text_is_reserved_for_the_bot`, `test_the_funds_command_and_reply_room_report_the_notice`, `test_agent_adapters.py::test_every_cli_command_has_an_mcp_tool_with_the_same_parameters` (12 commands). |
| On a real network, every language (AGENT-3, AGENT-3.a, AGENT-9) | `py/tests/test_agent_funds_localnet.py::test_low_funds_notice_once_per_drop_across_every_language`: the bot's throwaway wallet, funded from the local KMD dispenser, is brought just above the threshold; a TypeScript-written message in room A gets a reply that takes it low and one notice there; Go and Rust messages in rooms A and B get replies with no notice; after a refill a Kotlin message gets a reply with no notice and a Python message gets the reply that takes it low again, with one notice in room B; a restarted core still low stays quiet; separate `algochat-agent` CLI runs show `funds`, see a refill and warn once more; every bot transaction carries amount 0; exactly three notices; every implementation opens every note and reduces both rooms; Swift does the same through `swift test --filter AgentRoomsLocalnetTests`, which must run; no CLI output carries the key. |

## Localnet run

Local network only (`py/docs/localnet-testing.md`), Linux x86_64, `py/scripts/native-localnet.sh` layout (go-algorand dev mode, kmd, conduit, indexer, PostgreSQL), AlgoKit ports and token. Tools built as `py/tests/cross_tools.py` describes; Swift 6.0.3, JDK 17, Go, Rust, Bun.

```
cd py
ALGOCHAT_LOCALNET_ALGOD_DATA=<localnet>/net/data ALGOCHAT_REQUIRE_LOCALNET=1 python -m pytest
```

Results are recorded in the pull request.
