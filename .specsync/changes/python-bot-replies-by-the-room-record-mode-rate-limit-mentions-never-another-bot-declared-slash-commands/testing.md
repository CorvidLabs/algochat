---
change: python-bot-replies-by-the-room-record-mode-rate-limit-mentions-never-another-bot-declared-slash-commands
artifact: testing
---

# Testing

Unit tests use public non-secret seeds, a fake clock that follows the in-memory chain's block time, and no network.

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| AGENT-8.d mentions | `py/tests/test_agent_policy.py::test_mentions_need_the_at_sign_and_the_whole_name_or_address` (any case for the name, exact address, not in an email or a longer word), `test_mentions_mode_answers_at_name_at_address_and_replies_to_its_messages` (a section 9.2 reply to the bot's message counts; plain text is `not-mentioned`). |
| AGENT-8 modes | `test_every_message_mode_answers_everything_but_another_bot`, `test_commands_mode_posts_the_list_once_and_answers_declared_commands`, `test_a_bot_added_as_a_plain_member_has_no_mode_and_stays_silent`, `test_room_text_reads_plain_text_and_section_9_payloads`, `test_command_calls_match_declared_commands_only`. |
| AGENT-8.b rate limit | `test_rate_window_counts_posts_inside_the_window`, `test_the_rate_limit_skips_replies_over_it_and_survives_a_restart`, `test_the_command_list_waits_when_the_limit_is_full`. |
| AGENT-8.c never another bot | `test_every_message_mode_answers_everything_but_another_bot`, `test_a_one_to_one_message_from_a_room_bot_gets_no_answer`, `test_a_fresh_core_reads_its_rooms_before_answering_one_to_one` (a fresh core that has not read its rooms yet still skips the bot). |
| AGENT-8.e changes | `test_an_admin_changes_the_mode_and_the_bot_follows_from_the_next_message` (admin, then owner, with op 14). |
| AGENT-8.f commands | `test_the_command_list_is_plain_text_with_help_added`, `test_bad_command_names_are_refused`, `test_bot_names_and_descriptions_are_checked`, `test_commands_mode_posts_the_list_once_and_answers_declared_commands` (no repost after a restart, a new list when the commands change), `test_an_operator_help_command_replaces_the_built_in_list`. |
| On a real network, every language | `py/tests/test_agent_policy_localnet.py::test_bot_follows_the_room_record_across_every_language`: an owner adds an admin, another bot and our bot (mentions, 2 per 20 s) with op 13. TypeScript, Go, Rust, Python and Kotlin write messages with their own tools: one without a mention is skipped, two mentions are answered, the third is skipped for the rate limit, the other bot's is skipped. A restarted core is still limited (block times); after the window a reply to the bot's message is answered. The admin sets commands mode (4 per 30 s): the list is posted, `/echo` and `/help@helper` answered, plain text and `/echo@other` skipped, a fresh core posts no second list, the limit holds. The owner sets every message (10 per 60 s): a person is answered, the other bot is not. A one-to-one message from the other bot is skipped and one from a person answered. Every tool opens every note and reduces the chain with both bots' settings; Swift does the same in `swift test --filter AgentRoomsLocalnetTests`, which must exit 0 and write a marker. |
| Earlier room behavior | `py/tests/test_agent_rooms.py` and `py/tests/test_agent_rooms_localnet.py` still pass with the bot in every-message mode (10 per 60 s), and the localnet one now also compares bot settings across languages. |

## Localnet run

Local network only (`py/docs/localnet-testing.md`), Linux x86_64, `py/scripts/native-localnet.sh` layout (go-algorand dev mode, kmd, conduit, indexer, PostgreSQL), AlgoKit ports and token. Tools built as `py/tests/cross_tools.py` describes; Swift 6.0.3, JDK 17, Go, Rust, Bun.

```
cd py
ALGOCHAT_LOCALNET_ALGOD_DATA=<localnet>/net/data ALGOCHAT_REQUIRE_LOCALNET=1 python -m pytest
```

Result: 490 passed, 199 skipped. The skips are the existing cross-implementation fixture tests that are skipped on the base branch too, and the optional `py-algorand-sdk` decoder cross-check. All 10 `localnet` tests pass, the policy one included. The algochat#42 LocalNet script (`ts/scripts/group-bot-localnet.ts`), `pq-localnet.ts`, `room-scale-localnet.ts` and the full `swift test` pass on the same network.
