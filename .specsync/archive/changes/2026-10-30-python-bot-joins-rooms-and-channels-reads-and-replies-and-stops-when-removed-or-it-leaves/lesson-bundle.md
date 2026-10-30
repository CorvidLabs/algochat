# Lesson bundle — python-bot-joins-rooms-and-channels-reads-and-replies-and-stops-when-removed-or-it-leaves

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Python bot joins rooms and channels, reads and replies, and stops when removed or it leaves
- **Kind**: Feature
- **Paths**: py/specs/agent, py/specs/algochat, py/src/algochat/agent, py/src/algochat/blockchain.py, py/src/algochat/http_clients.py, py/tests, py/README.md, py/docs, swift/Tests/AlgoChatTests/AgentRoomsLocalnetTests.swift
- **Acceptance**: AGENT-6, AGENT-7, AGENT-7.c, AGENT-7.d and AGENT-7.g in hi/agent.md, as scoped by algochat#45: the Python bot joins a room or channel as soon as an owner or admin adds it and an authorized key reaches it, with no request or accept; a key from an account that may not deliver it is ignored; it reads room and channel messages in chain order and replies in plain text with its own account; a message is answered at most once, also after a restart, and nothing from before it joined; after another member is removed it uses the new key; after it is removed it stops in the room and its channels; after it leaves it posts a notice and stays out, also after a restart; room messages written by TypeScript, Go, Rust, Python and Kotlin are read on localnet, and every implementation including Swift (through a recorded-notes swift test on Linux) opens the bot's room notes and reduces the room chains the same way; unit tests use public non-secret seeds and no network; localnet tests use throwaway accounts funded only from the local KMD wallet.

## Evidence

- Verification commit: `45825f5db3eb9da789c3aa81ff2d04a4e31d73ba`
- Base commit: `77a8c31ee75ec3e099f7a605c62f21ca168e00ca`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

hi/agent.md AGENT-6 and AGENT-7, with AGENT-7.c (removing the bot is an ordinary removal: the room gets a new key and the bot is dropped from that room's channels), AGENT-7.d (an owner or admin adds the bot and it joins without accepting) and AGENT-7.g (the bot can be in a room's channels, and an admin adds it to each channel separately); leaving is AGENT-7 itself ("My bot can join a room and leave it"), confirmed by Leif on 2026-10-29. algochat#45 adds them to the agent core. This branch is stacked on feat/agent-dm (draft PR algochat#52, algochat#44) and merges feat/room-bot-record (draft PR algochat#51), which adds op 13 ADD_BOT and op 14 SET_BOT.

Before this change the Python agent core only knew one-to-one messages. The library already had section 5.8 rooms (records, reduction, key deliveries, room messages) and hybrid handshakes, but nothing tied them to a bot's account, and `NoteTransaction` had no position inside a round, so records and messages in one round could not be ordered as the protocol requires.

Found while building this: the protocol has no op for a member to remove themselves (op 11 remove is owner or admin only), so the bot cannot leave on chain by itself. Raven reads a member's ML-KEM key only from a signed ACPQ announcement, so the bot must publish one before an owner can hand it a key.

Out of scope: reply modes and rate limits from the room record (algochat#46), MCP, CLI and webhook adapters (algochat#47), the funds warning and operator guide (algochat#48), and a protocol self-leave op (a separate protocol change if wanted).

## From the change's design.md

# Design

- `algochat.agent.rooms` holds the room model: `Room`, `RoomMessage`, `RoomReply`, the status values, `LEAVE_NOTICE`, and an internal per-room tracker that reads a mailbox's 0x03 records and 0x07 messages, reduces the chain (with the parent room's records for a channel), checks key deliveries and opens messages.
- `AgentCore` gains `publish_pq_key`, `sync_rooms`, `read_rooms`, `send_room`, `reply_room`, `serve_rooms` and `leave_room`. The bot's ML-KEM-768 and X25519 keys are derived from its seed, as every implementation does.
- `NoteTransaction.intra_round_offset` is read from the indexer so ordering is (round, intra-round offset, transaction id), as section 5.8 specifies.
- `account.public_key_from_address` decodes an address back to its key, checking the checksum.

Design choices that are not confirmed intent, listed for Leif:

- Join: the bot joins on the first authorized key delivery, with no request or accept (AGENT-7.d). It accepts hybrid handshakes sent to it, and only uses a session opened by the same account that sent the delivery.
- Leave: the protocol has no self-leave op, so the bot posts a plain-text notice and stops. The notice is on chain, so a restarted bot stays out. Only an owner or admin can remove it and rotate the key. Leaving a room also leaves its channels.
- Removal: once the bot is not a member it reports `removed` and posts nothing. A channel inherits `removed` or `left` from its parent room at once.
- Room replies are plain UTF-8 text, as Raven shows room messages. A room reply format is left to algochat#46.
- Restart safety without a state file: messages at or before the later of the bot's join record and its own last post are not answered.
- Counter: one more than the highest counter seen in the epoch from anyone, like Raven.
- A failing handler is reported by error type and not retried, as for one-to-one messages.
- Reply modes in the room record are read and exposed on `Room.bot` but not enforced yet (algochat#46).

## From the change's testing.md

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

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
