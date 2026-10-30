---
change: python-bot-joins-rooms-and-channels-reads-and-replies-and-stops-when-removed-or-it-leaves
artifact: testing
---

# Testing

Unit tests use public non-secret seeds (bytes 0 to 31 for the bot, 0x11, 0x22, 0x44, 0x55, 0xA5 and 0x3C repeated) and no network.

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| AGENT-7.d join without accepting | `py/tests/test_agent_rooms.py::test_bot_joins_as_soon_as_it_is_added_without_a_request_or_accept`: the room is active with its name and bot settings, and the bot sent no transaction. |
| Only authorized keys | `test_a_key_is_used_only_when_the_room_authorizes_its_delivery` (a plain member, a stranger, and an owner citing a set-name record are all ignored; the owner citing the add works), `test_a_delivery_needs_a_session_from_its_own_sender`. |
| AGENT-6, AGENT-7 read and reply | `test_bot_reads_and_replies_in_its_room_once_and_not_again_after_a_restart` (the owner opens the reply; nothing twice; a restarted bot answers only new messages; its counter is above every counter seen), `test_messages_from_before_the_bot_joined_are_not_answered`, `test_notes_from_non_members_and_copied_notes_are_ignored`, `test_handler_errors_are_reported_and_silence_sends_nothing`. |
| New key after a member removal | `test_after_another_member_is_removed_the_bot_uses_the_new_key`, `test_bot_waits_for_the_new_key_and_cannot_post_meanwhile`. |
| AGENT-7.g channels | `test_bot_reads_and_replies_in_a_channel_it_was_added_to`, `test_a_channel_key_waits_until_the_bot_is_in_the_parent_room`. |
| AGENT-7.c removal, AGENT-7 leaving | `test_removing_the_bot_takes_it_out_of_the_room_and_its_channels`, `test_bot_leaves_a_room_and_its_channels_and_stays_out_after_a_restart` (`send_room` refuses the leave notice). |
| Signed PQ key | `test_publish_pq_key_posts_a_signed_key_once`; `test_unknown_rooms_are_refused`. |
| On a real network, every language | `py/tests/test_agent_rooms_localnet.py::test_bot_in_a_room_and_a_channel_across_every_language`: an owner makes a room and a channel and adds the bot with op 13; a key delivered by a plain member is ignored; TypeScript, Go, Rust, Python and Kotlin each write a room message (with emoji and accents) with their own tool, the member writes one and the owner one in the channel; the bot answers all seven with `serve_rooms`; a restarted bot answers nothing; after the member is removed the bot answers under the epoch 2 key; it leaves the channel and a fresh core reports it left; after its own removal (epoch 3) it answers nothing and cannot post. Every tool opens every bot and person room note (19) and reduces both chains to the same state as Python; Swift opens the same notes and reduces the same chains in `swift test --filter AgentRoomsLocalnetTests`, which must exit 0 and write a marker. |
| Parent removal on a real network | `test_removing_the_bot_from_the_room_takes_it_out_of_a_channel_it_never_left`. |

Negative checks run by hand: the Swift replay test exits 1 on a recorded file with one note's text changed, and on one with a room's expected epoch changed; it exits 0 on the unchanged file.

## Localnet run

Local network only (`py/docs/localnet-testing.md`), Linux x86_64, `py/scripts/native-localnet.sh` layout (go-algorand dev mode, kmd, conduit, indexer, PostgreSQL), AlgoKit ports and token. Tools built as `py/tests/cross_tools.py` describes; Swift 6.0.3, JDK 17, Go, Rust, Bun.

```
cd py
ALGOCHAT_LOCALNET_ALGOD_DATA=<localnet>/net/data ALGOCHAT_REQUIRE_LOCALNET=1 python -m pytest
```

Result after the 2026-10-29 review, rebased on algochat#52 (which sits on the hardened algochat#43 and merges algochat#50), two full runs in a row with OpenJDK 17 and `goal` on `PATH`: 515 passed, 198 skipped, all 9 `localnet` tests passing both times, the algochat#43 traceback, pickle and ACL tests included. `test_public_key_from_address_round_trips_and_checks_the_checksum` checks the address decoder refuses a changed checksum or key character, a short address and non-base32 text.

Known limit, unchanged in this PR and written in `py/specs/agent/context.md`: after a restart the bot resumes from its join record or its own last post in the room. A member message that confirmed before the bot's last post but was never answered is not answered after the restart. Room replies are plain text with no reference to the message they answer, so the bot cannot tell answered from unanswered messages before that post.

Earlier run (before the review): 468 passed, 199 skipped. The skips are the existing cross-implementation fixture tests that are skipped on the base branch too, and the optional `py-algorand-sdk` decoder cross-check. All 9 `localnet` tests pass, the 2 room ones included. The algochat#42 LocalNet script (`ts/scripts/group-bot-localnet.ts`), `pq-localnet.ts`, `room-scale-localnet.ts` and the full `swift test` (394 tests) pass on the same network.
