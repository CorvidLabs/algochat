---
spec: agent.spec.md
---

## Requirement Coverage

- `REQ-agent-001`: `tests/test_agent.py::TestAgentAccount`, including `test_matches_algosdk` and `test_word_index_matches_algosdk` (`py-algorand-sdk` is a dev dependency, so they run in CI), the 4-letter prefix tests, and the seed/field consistency, `asdict`/`vars`/pickle tests; `tests/test_agent.py::TestTracebackLocals` walks `tb.tb_frame.f_locals` of every library frame.
- `REQ-agent-002`: `tests/test_agent.py::TestLoadMnemonic` (owner, ACL, symlink to a 0644 target, FIFO, non-UTF-8, both variables plus a path, fstat-and-read on one descriptor) and `TestTracebackLocals`.
- `REQ-agent-003`: `tests/test_agent.py::TestAgentCore`.
- `REQ-agent-004`: `tests/test_agent_direct.py` (an in-memory chain that decodes each signed payment), `tests/test_transaction.py` (transaction ids and signed bytes match `py-algorand-sdk` vectors), `tests/test_http_clients.py` (next-token paging, errors without the token, against a loopback server).
- `REQ-agent-005`: `tests/test_agent_rooms.py` (the in-memory chain with an owner drafting records through the library, `tests/room_support.py`): joining without a request, refused deliveries (plain member, stranger, set-name record, a session from another account), read and reply, no answer after a restart or for history before the join, non-members and copied notes, a new key after a member removal, waiting for a key, channels and their parent, removal from a room and its channels, leaving and restarting, handler errors, and the signed PQ key.

Unit-test fixtures use public, non-secret seeds and call no network.

`tests/test_agent_localnet.py` (marker `localnet`) runs the same requirements against a real local Algorand network (algod, kmd, indexer) and is skipped when none is running; `ALGOCHAT_REQUIRE_LOCALNET=1` turns the skip into a failure. Accounts are generated per test and funded only from the localnet's own KMD wallet; the helpers refuse any non-local genesis id. See `docs/localnet-testing.md`.

- `REQ-agent-001`: `test_bot_account_from_env_mnemonic_matches_funded_localnet_account` (algod accepts transactions signed with the decoded seed), `test_mnemonic_decoding_matches_goal_export` (cross-check against go-algorand's `goal`, when `ALGOCHAT_LOCALNET_ALGOD_DATA` is set).
- `REQ-agent-002`: `test_bot_account_from_owner_only_mnemonic_file`, `test_errors_reprs_and_logs_never_leak_the_bot_key`.
- `REQ-agent-003`: `test_bot_sends_and_receives_a_real_message_on_localnet` (a second account and the bot exchange encrypted messages through the indexer, verified keys only).
- `REQ-agent-004`: `tests/test_agent_direct_localnet.py`. TypeScript, Go, Rust, Python and Kotlin each write a message to the bot with their own tool; the bot reads and answers all of them with `serve_direct`; a restarted bot answers nothing; the person sees each reply with its reply context; every implementation opens every bot note and every person note as both parties; Swift opens the same confirmed notes through `swift test --filter AgentDirectLocalnetTests` (its own tool needs macOS 26), which must run, not skip. `test_bot_reads_a_long_history_across_indexer_pages` reads more messages than one indexer page. The tools are built as `tests/cross_tools.py` describes; with `ALGOCHAT_REQUIRE_LOCALNET=1` a missing tool fails the run.
- `REQ-agent-005`: `tests/test_agent_rooms_localnet.py`. An owner makes a room and a channel on LocalNet and adds the bot with op 13; a key delivered by a plain member is ignored. TypeScript, Go, Rust, Python and Kotlin each write a room message with their own tool; the bot answers all of them and a channel message with `serve_rooms`; a restarted bot answers nothing. After a member removal the bot answers under the epoch 2 key; it leaves the channel and a fresh core stays out; after its own removal it answers nothing and cannot post. Every implementation opens every bot and person room note and reduces both chains to the same state; Swift does the same through `swift test --filter AgentRoomsLocalnetTests`, which must run, not skip. `test_removing_the_bot_from_the_room_takes_it_out_of_a_channel_it_never_left` covers parent removal.
