# Lesson bundle — python-bot-reads-one-to-one-messages-and-replies-by-itself

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Python bot reads one-to-one messages and replies by itself
- **Kind**: Feature
- **Paths**: py/specs/agent, py/specs/algochat, py/src/algochat/agent, py/src/algochat/transaction.py, py/src/algochat/http_clients.py, py/src/algochat/client.py, py/src/algochat/__init__.py, py/tests, py/README.md, py/docs, swift/Tests/AlgoChatTests/AgentDirectLocalnetTests.swift
- **Acceptance**: AGENT-5 in hi/agent.md, as scoped by algochat#44: the Python bot publishes its signed key, reads one-to-one messages to it across every indexer page, and replies by itself through the library's own payment path with a section 9.2 reply; a message is answered at most once, also after a restart; messages written by TypeScript, Go, Rust, Python and Kotlin are read on localnet, and every implementation including Swift (through a recorded-notes swift test on Linux) reads the bot's replies; unit tests use public non-secret seeds and no network; localnet tests use throwaway accounts funded only from the local KMD wallet.

## Evidence

- Verification commit: `d5e87e4451b03843288d34299cff95b9e031b6c4`
- Base commit: `5b92d0a172670ff3fb87273b7db7681bdae6cdf5`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

hi/agent.md AGENT-5 (confirmed by Leif on 2026-10-29): the bot reads one-to-one messages to it and replies. algochat#44 adds that on the agent core from algochat#43 (this branch is stacked on feat/agent-core, draft PR algochat#49). The ticket also asks that sending move into the library, so the bot replies with its own account and the localnet tests use the same path.

Before this change the Python library had no way to build or submit a transaction: the localnet tests from algochat#43 carried their own msgpack encoder and HTTP clients. `AlgoChat.process_transaction` dropped the reply context of a section 9.2 reply, so a bot could not tell which messages it had already answered.

Found on localnet while building this: the indexer lists an address's transactions newest first, so paging by round alone would have skipped older messages. The HTTP indexer client now follows the indexer's next tokens.

Out of scope: rooms and channels (algochat#45), reply policy (algochat#46), MCP, CLI and webhook adapters (algochat#47), the funds warning and operator guide (algochat#48).

## From the change's design.md

# Design

- `algochat.transaction` builds, signs and sends a payment in canonical msgpack with Ed25519 from `cryptography`. No Algorand SDK. Fees use the existing `payment_fee`, errors the existing `TransactionError`.
- `algochat.http_clients` implements `AlgodClient` and `IndexerClient` with the standard library. No default endpoint, http(s) only, tokens never in `repr` or errors.
- `AgentCore` gains `publish_key`, `send_direct`, `read_direct`, `reply` and `serve_direct`. Replies use the section 9.2 payload, which every implementation already parses.
- `AlgoChat.process_transaction` now fills `reply_context` for standard notes.

Design choices that are not confirmed intent, listed for Leif:

- Restart safety without a state file: the bot learns which messages it answered from its own replies on chain (`replyTo.txid`).
- A failing handler is reported by error type and not retried, so one bad message cannot make the bot pay fees in a loop.
- Notes the bot cannot open are skipped silently (logged at debug level by type only).
- `publish_key` skips when the same verified key is already on chain.
- `read_direct` reads the whole history once, then only rounds after its cursor.
- The reply preview is cut by Python characters (80, else 77 and `...`). TypeScript cuts by UTF-16 units; the two differ only for characters outside the Basic Multilingual Plane.
- The bot refuses to message itself.

## From the change's testing.md

# Testing

Unit tests use public non-secret seeds (bytes 0 to 31, 0xA5 and 0x3C repeated) and no network.

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| Payments in the library | `py/tests/test_transaction.py`: transaction ids and signed-byte hashes match `py-algorand-sdk` for a short note and a 1200-byte note; fee surcharge past 1024 bytes; oversized note, negative amount and a foreign seed refused; a mismatched txid from algod refused. |
| HTTP clients | `py/tests/test_http_clients.py` against a loopback server: an unlimited search follows next tokens, a limited one is one page after the round, errors carry the status and never the token, pool errors fail confirmation, non-http URLs are refused. |
| AGENT-5 read and reply | `py/tests/test_agent_direct.py` on an in-memory chain that decodes each signed payment: the bot reads a message and replies with a 9.2 reply the person opens with its context; each message once; own notes skipped; a restarted bot does not answer twice; `serve_direct` replies, stays silent on `None`, isolates a failing handler; unreadable notes skipped; no key and self refused; a key publish is not repeated. |
| AGENT-5 on a real network, every language | `py/tests/test_agent_direct_localnet.py::test_bot_reads_and_answers_every_language_and_every_language_reads_the_bot`: TypeScript, Go, Rust, Python and Kotlin each write a message (with emoji and accents) to the bot with their own tool; the bot answers all five with `serve_direct` and sends one plain note; a restarted bot answers nothing; the person sees each reply with its context; every tool opens every bot note and every person note as both parties; Swift opens the same 11 confirmed notes in `swift test --filter AgentDirectLocalnetTests`, which writes a marker as its last step so a skipped test fails the run. |
| Paging on a real indexer | `test_bot_reads_a_long_history_across_indexer_pages`: seven messages read with a three-transaction page, oldest first. |
| Library path in the algochat#43 tests | `py/tests/test_agent_localnet.py` now publishes keys and sends through `AgentCore` and `algochat.transaction`; the unfunded-bot case now raises the library's `HttpError`. |

Negative checks run by hand: the Swift replay test fails (exit 1) on a record whose text does not match.

## Localnet run

Local network only (`py/docs/localnet-testing.md`), Linux x86_64, `py/scripts/native-localnet.sh` layout (go-algorand dev mode, kmd, conduit, indexer, PostgreSQL), AlgoKit ports and token. Tools built as `py/tests/cross_tools.py` describes; Swift 6.0.3, JDK 17, Go, Rust, Bun.

```
cd py
ALGOCHAT_LOCALNET_ALGOD_DATA=<localnet>/net/data ALGOCHAT_REQUIRE_LOCALNET=1 python -m pytest
```

Result after the 2026-10-29 review, rebased on algochat#43 at `1d57b8e` with algochat#50 merged, two full runs in a row with OpenJDK 17 on `PATH` and `goal` on `PATH`: 469 passed, 198 skipped. The skips are the existing cross-implementation fixture tests that are skipped on the base branch too. All 7 `localnet` tests pass on both runs, including the algochat#43 traceback, pickle and ACL tests.

`test_the_chat_client_and_the_core_give_the_key_as_32_raw_bytes` checks that `AlgoChat.encryption_public_key` is 32 raw bytes (algochat#50) and that `AgentCore.encryption_public_key` passes it through; the core no longer converts a key object.

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
