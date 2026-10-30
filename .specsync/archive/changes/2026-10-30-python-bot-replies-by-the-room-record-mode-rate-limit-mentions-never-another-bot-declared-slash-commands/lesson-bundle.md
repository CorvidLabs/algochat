# Lesson bundle — python-bot-replies-by-the-room-record-mode-rate-limit-mentions-never-another-bot-declared-slash-commands

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Python bot replies by the room record: mode, rate limit, mentions, never another bot, declared slash commands
- **Kind**: Feature
- **Paths**: py/specs/agent, py/src/algochat/agent, py/tests, py/README.md, py/docs, swift/Tests/AlgoChatTests/AgentRoomsLocalnetTests.swift
- **Acceptance**: AGENT-8, AGENT-8.b, AGENT-8.c, AGENT-8.d, AGENT-8.e and AGENT-8.f in hi/agent.md, as scoped by algochat#46: in each room the Python bot replies only in the mode the room's record holds (mentions: @name, @address or a reply to one of its messages; every message; commands: only its declared /commands); it posts at most the record's replies in any window of the record's seconds, also across a restart, and skips (does not queue) messages over the limit; it never answers an account a room's record marks as a bot, in rooms or one-to-one; a mode or limit change by the owner or an admin (op 14) applies from the next message it handles; in commands mode it posts its command list once as plain room text (again only when the list changes) and answers /help with it; a bot added as a plain member has no mode and stays silent; on localnet, messages written by TypeScript, Go, Rust, Python and Kotlin drive every mode, and every implementation including Swift (through the recorded-notes swift test on Linux) opens the bot's notes and reduces the room chain with both bots' modes and limits; unit tests use public non-secret seeds, a fake clock and no network; localnet tests use throwaway accounts funded only from the local KMD wallet.

## Evidence

- Verification commit: `1d1d706dc620de9380e017542a2af4b13ab0611c`
- Base commit: `e32b4671829c9d82d32271392b44feda973b5716`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

hi/agent.md AGENT-8 with AGENT-8.b (rate limit), AGENT-8.c (never another bot), AGENT-8.d (mentions), AGENT-8.e (owner or admin changes mode and limit) and AGENT-8.f (the bot declares its slash commands), confirmed by Leif on 2026-10-29. algochat#46 adds them to the agent core. This branch is stacked on feat/agent-rooms (draft PR algochat#53, algochat#45), which merges feat/room-bot-record (draft PR algochat#51, op 13 ADD_BOT and op 14 SET_BOT).

Before this change the bot answered every room message it could open. The room record already carried its mode (1 mentions, 2 every message, 3 commands), replies and seconds, and marked bots, but nothing used them.

Found while building this: section 5.8 defines no default mode, so a bot added as a plain member has none; the protocol has no note for a bot's command list, and Raven shows room text as plain text, so a plain-text list is the one form every client reads today.

Out of scope: MCP, CLI and webhook adapters (algochat#47), the funds warning and operator guide (algochat#48), and a structured command-list note in the protocol (a separate protocol change if wanted).

## From the change's design.md

# Design

- `algochat.agent.policy` is pure: section 9 room text, mentions, command calls, the command list and the rate window, with no I/O.
- `AgentCore` reads the bot's entry (`mode`, `replies`, `seconds`) from each room's current reduced state each time it serves, and checks in order: sender marked as a bot, no mode, not mentioned, not a command, rate limit. A skipped message is marked handled and reported in `RoomReply.skipped`.
- The bot's post times and "now" are both chain time: block times it read, carried forward with a monotonic clock since the newest one. The wall clock is never compared with block times, so a skewed host or node keeps the same window and a restart keeps it too.
- `send_room`, `reply_room`, `send_direct` and `reply` read the rooms again and refuse with `PolicySkip` (a `PermissionError`) what the policy rules out, so a caller outside `serve_rooms` cannot answer a bot, a no-mode room or over the limit.

Design choices that are not confirmed intent, listed for Leif:

- Mode and limit are read from the room's current record every time the bot serves, so an op 14 change also covers messages it has not handled yet.
- A bot added as a plain member has no mode and never replies there (section 5.8 has no default mode).
- A mention is `@` plus the bot's name (any case) or its address (exact), not inside an email address or a longer word, or a section 9.2 reply naming one of its messages.
- Commands are declared in operator code (`BotCommand`). In commands mode the bot posts a plain-text list (`Commands for @name:` then `/command - description`) once per change, restart-safe, with no protocol change so every client including Raven reads it. `/help` is built in unless the operator declares `help`. `/command@otherbot` is not for this bot.
- Every post in a room counts toward the limit: replies, `/help` answers and command lists. The leave notice is exempt. Messages over the limit are skipped, not queued, so the bot never answers late in a burst.
- An account any of the bot's rooms marks as a bot is never answered, in rooms and one-to-one.
- The bot's own room replies stay plain text.

## From the change's testing.md

# Testing

Unit tests use public non-secret seeds, a fake monotonic clock, the in-memory chain's block time (one second per round, with a settable base), and no network.

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| AGENT-8.d mentions | `py/tests/test_agent_policy.py::test_mentions_need_the_at_sign_and_the_whole_name_or_address` (any case for the name, exact address, not in an email or a longer word), `test_mentions_mode_answers_at_name_at_address_and_replies_to_its_messages` (a section 9.2 reply to the bot's message counts; plain text is `not-mentioned`). |
| AGENT-8 modes | `test_every_message_mode_answers_everything_but_another_bot`, `test_commands_mode_posts_the_list_once_and_answers_declared_commands`, `test_a_bot_added_as_a_plain_member_has_no_mode_and_stays_silent`, `test_room_text_reads_plain_text_and_section_9_payloads`, `test_command_calls_match_declared_commands_only`. |
| AGENT-8.b rate limit | `test_rate_window_counts_posts_inside_the_window`, `test_the_rate_limit_skips_replies_over_it_and_survives_a_restart`, `test_the_command_list_waits_when_the_limit_is_full`, `test_a_chain_clock_behind_the_host_keeps_the_limit_across_a_restart` (no fake clock; fails with a host `time.time()` clock), `test_a_chain_clock_ahead_of_the_host_opens_the_window_again`, `test_send_room_and_reply_room_count_against_one_window`. |
| Explicit sends follow the policy | `test_reply_room_refuses_what_the_policy_skips_and_posts_nothing`, `test_reply_room_reads_the_room_again_and_follows_a_mode_change`, `test_reply_room_decides_from_bot_from_the_rooms_not_the_message`, `test_send_room_refuses_a_room_that_gives_the_bot_no_mode`, `test_send_direct_and_reply_refuse_a_room_bot_before_paying`. Each fails on the code before the review fix. |
| AGENT-8.c never another bot | `test_every_message_mode_answers_everything_but_another_bot`, `test_a_one_to_one_message_from_a_room_bot_gets_no_answer`, `test_a_fresh_core_reads_its_rooms_before_answering_one_to_one` (a fresh core that has not read its rooms yet still skips the bot). |
| AGENT-8.e changes | `test_an_admin_changes_the_mode_and_the_bot_follows_from_the_next_message` (admin, then owner, with op 14). |
| AGENT-8.f commands | `test_the_command_list_is_plain_text_with_help_added`, `test_bad_command_names_are_refused`, `test_bot_names_and_descriptions_are_checked`, `test_commands_mode_posts_the_list_once_and_answers_declared_commands` (no repost after a restart, a new list when the commands change), `test_an_operator_help_command_replaces_the_built_in_list`. |
| On a real network, every language | `py/tests/test_agent_policy_localnet.py::test_bot_follows_the_room_record_across_every_language`: an owner adds an admin, another bot and our bot (mentions, 2 per 60 s) with op 13. Block time is levelled with the host first (dev mode moves it at most 25 s per block, so after an idle spell it lags), and waits are measured in block time, so a slow indexer or slow tools cannot open the window early; the cross-language note checks run after the rate assertions. TypeScript, Go, Rust, Python and Kotlin write messages with their own tools: one without a mention is skipped, two mentions are answered, the third is skipped for the rate limit, the other bot's is skipped. A restarted core is still limited (block times); after the window a reply to the bot's message is answered. The admin sets commands mode (4 per 60 s): the list is posted, `/echo` and `/help@helper` answered, plain text and `/echo@other` skipped, a fresh core posts no second list, the limit holds. The owner sets every message (10 per 60 s): a person is answered, the other bot is not. A one-to-one message from the other bot is skipped and one from a person answered. Every tool opens every note and reduces the chain with both bots' settings; Swift does the same in `swift test --filter AgentRoomsLocalnetTests`, which must exit 0 and write a marker. |
| Earlier room behavior | `py/tests/test_agent_rooms.py` and `py/tests/test_agent_rooms_localnet.py` still pass with the bot in every-message mode (10 per 60 s), and the localnet one now also compares bot settings across languages. |

## Localnet run

Local network only (`py/docs/localnet-testing.md`), Linux x86_64, `py/scripts/native-localnet.sh` layout (go-algorand dev mode, kmd, conduit, indexer, PostgreSQL), AlgoKit ports and token. Tools built as `py/tests/cross_tools.py` describes; Swift 6.0.3, JDK 17, Go, Rust, Bun.

```
cd py
ALGOCHAT_LOCALNET_ALGOD_DATA=<localnet>/net/data ALGOCHAT_REQUIRE_LOCALNET=1 python -m pytest
```

Result after Leif's review (rebased on the hardened agent core and #50/#51): 546 passed, 198 skipped, two runs in a row with OpenJDK 17 on PATH and `ALGOCHAT_REQUIRE_LOCALNET=1`; the chain-clock regressions pass and fail on the code before the fix. Earlier result: 491 passed, 199 skipped (with the 49b8cc2 fix). The skips are the existing cross-implementation fixture tests that are skipped on the base branch too, and the optional `py-algorand-sdk` decoder cross-check. All 10 `localnet` tests pass both runs, the policy one with its restart step included. The algochat#42 LocalNet script (`ts/scripts/group-bot-localnet.ts`), `pq-localnet.ts`, `room-scale-localnet.ts` and the full `swift test` pass on the same network.

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
