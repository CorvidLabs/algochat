---
change: python-bot-reads-one-to-one-messages-and-replies-by-itself
artifact: testing
---

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

Result: 423 passed, 199 skipped. The skips are the existing cross-implementation fixture tests that are skipped on the base branch too, and the optional `py-algorand-sdk` decoder cross-check. All 7 `localnet` tests pass.
