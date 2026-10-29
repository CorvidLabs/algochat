---
spec: agent.spec.md
---

## Requirement Coverage

- `REQ-agent-001`: `tests/test_agent.py::TestAgentAccount`, including `test_matches_algosdk` when `py-algorand-sdk` is installed (skipped otherwise; fixed vectors still run).
- `REQ-agent-002`: `tests/test_agent.py::TestLoadMnemonic`.
- `REQ-agent-003`: `tests/test_agent.py::TestAgentCore`.

Unit-test fixtures use public, non-secret seeds and call no network.

`tests/test_agent_localnet.py` (marker `localnet`) runs the same requirements against a real local Algorand network (algod, kmd, indexer) and is skipped when none is running; `ALGOCHAT_REQUIRE_LOCALNET=1` turns the skip into a failure. Accounts are generated per test and funded only from the localnet's own KMD wallet; the helpers refuse any non-local genesis id. See `docs/localnet-testing.md`.

- `REQ-agent-001`: `test_bot_account_from_env_mnemonic_matches_funded_localnet_account` (algod accepts transactions signed with the decoded seed), `test_mnemonic_decoding_matches_goal_export` (cross-check against go-algorand's `goal`, when `ALGOCHAT_LOCALNET_ALGOD_DATA` is set).
- `REQ-agent-002`: `test_bot_account_from_owner_only_mnemonic_file`, `test_errors_reprs_and_logs_never_leak_the_bot_key`.
- `REQ-agent-003`: `test_bot_sends_and_receives_a_real_message_on_localnet` (a second account and the bot exchange encrypted messages through the indexer, verified keys only).
