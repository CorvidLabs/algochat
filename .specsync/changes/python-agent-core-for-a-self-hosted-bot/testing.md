---
change: python-agent-core-for-a-self-hosted-bot
artifact: testing
---

# Testing

`py/tests/test_agent.py` runs with mocks only and public non-secret seeds (bytes 0 to 31, and 0xA5 repeated). `test_matches_algosdk` cross-checks the decoder against `py-algorand-sdk` when it is installed and is skipped otherwise.

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| AGENT-2 own account | `TestAgentAccount` decodes fixed vectors to seed and address, round-trips the address through the library decoder, and refuses bad count, unknown word, padding and checksum. |
| AGENT-4 env or local file | `TestLoadMnemonic` covers both env vars, explicit path, missing and ambiguous sources, owner-only modes, unsafe modes, directories, empty and oversized files, symlinks, and the ignore patterns. |
| AGENT-1, 1.b, 1.d shared self-hosted core | `TestAgentCore` builds the core from an account, env var and file on mock clients, and refuses a chat client for another address. |
| AGENT-2 on a real network | `test_bot_account_from_env_mnemonic_matches_funded_localnet_account`: the account decoded from the mnemonic is the funded localnet account and algod accepts transactions it signs. `test_mnemonic_decoding_matches_goal_export` cross-checks the decoder against go-algorand's `goal`. |
| AGENT-4 on a real network | `test_bot_account_from_owner_only_mnemonic_file` and `test_errors_reprs_and_logs_never_leak_the_bot_key`: bad checksum, unknown word, short phrase, both sources set, world-readable file, short seed, and an unfunded bot rejected by algod; no error, repr or log contains the phrase, three consecutive words of it, or the seed in hex, base64 or base32. |
| AGENT-1, 1.b, 1.d on a real network | `test_bot_sends_and_receives_a_real_message_on_localnet`: a second account sends the bot an encrypted message, the bot reads it through the indexer and replies, and the second account reads the reply; verified keys only. |

## Localnet run

Local network only (`py/docs/localnet-testing.md`). Run on Linux x86_64 with `py/scripts/native-localnet.sh` (go-algorand 5.0.5 dev mode, kmd, conduit 1.11.1, indexer 3.11.1, PostgreSQL 16.4), AlgoKit-compatible ports and token:

```
cd py
ALGOCHAT_LOCALNET_ALGOD_DATA=<localnet>/net/data ALGOCHAT_REQUIRE_LOCALNET=1 python -m pytest
```

Result: 398 passed, 199 skipped (the skips are the existing cross-implementation tests that need other toolchains), including all 5 `localnet` tests. Without a localnet the 5 tests skip.
