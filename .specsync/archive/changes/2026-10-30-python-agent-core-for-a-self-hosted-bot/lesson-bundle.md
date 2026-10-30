# Lesson bundle — python-agent-core-for-a-self-hosted-bot

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Python agent core for a self-hosted bot
- **Kind**: Feature
- **Paths**: .gitignore, py/README.md, py/docs/localnet-testing.md, py/pyproject.toml, py/scripts/native-localnet.sh, py/specs/agent, py/src/algochat/agent, py/tests/localnet_support.py, py/tests/test_agent.py, py/tests/test_agent_localnet.py
- **Acceptance**: AGENT-1, AGENT-1.b, AGENT-1.d, AGENT-4 and the wallet half of AGENT-2 in hi/agent.md, as scoped by algochat#43 (AGENT-2's Raven identity NFT half is out of scope, see plan.md): algochat.agent builds the bot's own Algorand account from its 25-word mnemonic, read only from ALGOCHAT_AGENT_MNEMONIC or an owner-only local file named by ALGOCHAT_AGENT_MNEMONIC_FILE; AgentCore binds an AlgoChat client to that account on operator-supplied algod and indexer clients; unit tests use mocks and public non-secret seeds only; localnet integration tests use throwaway accounts funded from the local network's own KMD wallet only.

## Evidence

- Verification commit: `7ceaa06efd9f6e180d5f4b4109504290557b4102`
- Base commit: `8e165d5a399fd0e5b94fe2998a07f2a43f448328`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

Leif confirmed hi/agent.md on 2026-10-29 (merged as 8e165d5): any agent can use AlgoChat as a bot through one shared core, starting in Python, self-hosted by its operator, with its own wallet, and with its key in an env var or local file on the bot host. algochat#43 covers AGENT-1, AGENT-1.b, AGENT-1.d, AGENT-2 and AGENT-4. Replies, rooms, reply policy, adapters and the funds warning are algochat#44 to #48 and are out of scope here.

Baseline on main before this change: `ruff check src/ tests/` reports 17 errors in existing files, and `specsync check --strict --require-coverage 100 --force` in py/ stops at 95% because `src/algochat/group.py` has no module spec. This change does not touch either.

## From the change's design.md

# Design

`algochat.agent` is a subpackage, not part of the root `algochat` exports, leaving room for later cli, mcp and webhook modules.

Design choices that are not confirmed intent, listed for Leif:

- A mnemonic file with any group or other permission bit is refused, like ssh private keys. Following the ssh rule, it must also be owned by the user running the bot or by root, and a file with a POSIX access ACL is refused. The checks run with `fstat` on the opened descriptor and only that descriptor is read, so the file cannot be swapped in between. Symlinks are followed and the target is checked. FIFOs are opened non-blocking and refused as non-regular.
- Both env vars set (non-empty after stripping whitespace) is refused rather than picking one, even when an explicit path is passed.
- The decoder accepts full words and, like `py-algorand-sdk`, unique word prefixes of 4 or more letters (the same word-to-index table). Chosen over narrowing the spec to full words so phrases accepted by algosdk are accepted here too; full words from `goal account export` and wallets still work, and prefixes under 4 letters are refused.
- Names: `ALGOCHAT_AGENT_MNEMONIC`, `ALGOCHAT_AGENT_MNEMONIC_FILE`; ignore patterns `*.mnemonic`, `.algochat-agent/`.
- The mnemonic decoder and word list are bundled instead of depending on `py-algorand-sdk`.
- Ed25519 accounts only.
- `AgentAccount` fields are only `address` and `ed25519_public_key`. The seed is a constructor argument kept in a private redacting holder (not a dataclass field), read through the `seed` property, kept out of `repr`, `str`, `asdict` and `vars`, and pickling is refused. The constructor re-derives the public key and address from the seed and refuses a mismatch, so equal accounts always have the same seed. `AgentCore` also checks the chat client's Ed25519 public key, not only its address.
- Errors never echo the mnemonic, the file bytes, or the seed. Decoding runs in a helper that returns `(seed, error)` instead of raising, and functions clear their phrase, seed and environment locals before raising, so no frame on an `AgentConfigError` traceback holds them. Errors are raised outside `except` blocks where the caught exception could carry file bytes (for example `UnicodeDecodeError`), so the chain is empty.
- `py/scripts/native-localnet.sh` pins a SHA-256 for every download and verifies it before unpacking.

## From the change's testing.md

# Testing

`py/tests/test_agent.py` runs with mocks only and public non-secret seeds (bytes 0 to 31, and 0xA5 repeated). `test_matches_algosdk` and `test_word_index_matches_algosdk` cross-check the decoder and its word-prefix table against `py-algorand-sdk`, which is a dev dependency, so they run in CI (they skip only if it is missing).

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| AGENT-2 own account (wallet half) | `TestAgentAccount` decodes fixed vectors to seed and address, accepts algosdk's unique 4-letter-or-longer word prefixes and refuses shorter ones, round-trips the address through the library decoder, and refuses bad count, unknown word, padding and checksum. It checks that the constructor refuses an address or public key that does not match the seed, that equal accounts have the same seed, that the seed is not a dataclass field and is absent from `repr`, `str`, `asdict` and `vars` (as `repr(seed)`, hex, or any run of three mnemonic words), and that pickling is refused. |
| AGENT-4 env or local file | `TestLoadMnemonic` covers both env vars, explicit path, missing and ambiguous sources (including both variables plus a path, and whitespace-only values counting as unset), owner-only modes, unsafe modes, another owner, a real POSIX ACL (via `setfacl`, skipped where unavailable) and the ACL check on the open descriptor, no read before the checks, fstat and read on the same descriptor, directories, FIFOs, unreadable, empty, oversized and non-UTF-8 files, symlinks to 0600 and 0644 targets, and the ignore patterns. |
| AGENT-4 no secret on tracebacks | `TestTracebackLocals` walks `tb.tb_frame.f_locals` of every library frame (and chained exceptions) for bad checksum, padding, unknown word, short phrase, short seed, both env vars (passed in and from `os.environ`), a non-UTF-8 file, and `AgentCore.from_environment` with an env var or a file, and asserts the phrase, every 3-word run, and the seed bytes are absent from those locals and from each exception's `str`, `repr`, arguments and attributes. Self-tests prove the walker catches a leaking local and a leaking exception attribute. |
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

Result after the second review (2026-10-29), two runs in a row with OpenJDK 17 on `PATH`: 443 passed, 198 skipped (the skips are the existing cross-implementation tests that need other toolchains), including all 5 `localnet` tests and the `goal account export` cross-check. Without a localnet the 5 tests skip, and `ALGOCHAT_REQUIRE_LOCALNET=1` turns that into a failure. `ruff check` and `mypy --strict` pass on `src/algochat/agent`. `py/scripts/native-localnet.sh` downloaded and verified all pinned files from scratch, and refused (and deleted) a tampered tarball without unpacking it.

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
