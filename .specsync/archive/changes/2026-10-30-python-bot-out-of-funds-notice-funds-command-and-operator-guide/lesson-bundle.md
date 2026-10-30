# Lesson bundle — python-bot-out-of-funds-notice-funds-command-and-operator-guide

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Python bot out-of-funds notice, funds command and operator guide
- **Kind**: Feature
- **Paths**: py/specs/agent, py/src/algochat/agent, py/tests, py/README.md, py/docs
- **Acceptance**: AGENT-1.d, AGENT-3, AGENT-3.a, AGENT-4 and AGENT-9 in hi/agent.md, as scoped by algochat#48: the operator self-hosts the bot and funds its own wallet, which pays every fee; when fewer than about 100 replies' worth of fees remain, the bot posts a short out-of-funds warning once, in the room where it reached that level, and not again until its wallet is refilled; the bot sends no payments or tips; an operator guide covers self-hosting, funding and keeping the mnemonic in an env var or local file that is never committed; on localnet the bot's throwaway wallet, funded only from the local KMD wallet, drops below the threshold after a reply in one room, posts exactly one notice there and none in the other room, posts no further notice while low (also after a restart and in separate CLI runs), re-arms after a refill and warns once in the room of the next drop, every bot transaction carries no amount, and every implementation including Swift (through the recorded-notes swift test on Linux) opens the bot's notes and reduces both rooms; unit tests use public non-secret seeds and an in-memory chain only.

## Evidence

- Verification commit: `daaf0727fb4a7728cc7ebfb9f5e2b88e3fdacf4b`
- Base commit: `bf386df9960b5c5c1cbc45ac342e543d7d81b821`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

hi/agent.md AGENT-1.d (in the first version the operator hosts the bot), AGENT-3 (the operator funds the bot's wallet, which pays its fees), AGENT-3.a (when fewer than about 100 replies' worth of fees remain, the bot warns once, in the room where it reached that level, until refilled), AGENT-4 (the key lives in an env var or local file and is never committed) and AGENT-9 (no payments or tips in the first version), confirmed by Leif on 2026-10-29. algochat#48 adds the warning and the operator guide. This branch is stacked on feat/agent-adapters (draft PR algochat#55, algochat#47).

Before this change the bot paid fees from its own wallet but had no way to tell anyone it was running out; an empty wallet only showed up as failed sends. Operators had no single guide for hosting, funding and key handling.

A fresh CLI run has no memory, so the "warned already" state must come from the chain: the bot's own notice, and whether money came in after it.

Out of scope: payments and tips (AGENT-9, later), hosted bots, automatic refills, and notices one-to-one.

## From the change's design.md

# Design

- `FundsStatus` is a pure value from algod's account info and suggested params; `low` is `spendable < fee_per_reply x 100`.
- The notice goes through the same `_post` as a reply, so it is plain section 5.8 room text every implementation and Raven read, with no protocol change.
- The core keeps `_low_funds_warned` (unknown, false or true). Unknown means "look at the chain": its latest notice since it was last added, in any room, is current unless today's spendable balance plus the fees of every note it sent after that notice reaches the threshold.

Design choices that are not confirmed intent, listed for Leif:

- One reply's worth is the fee of a payment with the largest note (4096 bytes) at the network's minimum fee: 1308 microAlgos at a 1000 minimum fee, so the threshold is 0.1308 Algo above the minimum balance. This warns early rather than late.
- Only the balance above the account's minimum balance counts.
- Notice text: "I'm running low on funds for fees. My operator needs to refill my wallet."
- The check runs after every room post and after one-to-one replies; the notice goes only in a room (the first room post while low, if the drop came from a one-to-one reply).
- The notice is posted even when the room's rate limit is full, and counts toward the limit after.
- Seeing the wallet not low counts as a refill.
- A `funds` command and MCP tool show the wallet; `reply-room` and `serve` report `low_funds_notice`.
- `send_room` refuses the notice text, so only the bot's own check posts it.
- A failed funds check is logged by error type and posts nothing.

## From the change's testing.md

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

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
