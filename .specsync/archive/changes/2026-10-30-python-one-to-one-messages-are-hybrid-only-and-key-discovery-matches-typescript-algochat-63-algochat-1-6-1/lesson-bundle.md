# Lesson bundle — python-one-to-one-messages-are-hybrid-only-and-key-discovery-matches-typescript-algochat-63-algochat-1-6-1

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Python one-to-one messages are hybrid only and key discovery matches TypeScript (algochat#63, AlgoChat 1.6.1)
- **Kind**: BugFix
- **Paths**: py/src/algochat, py/tests, py/specs, py/README.md, py/pyproject.toml, hi/base.md, hi/encrypt.md, hi/agent.md, hi/keys.md, INTENT.md, CHANGELOG.md, README.md
- **Acceptance**: AC1-AC7 as Leif confirmed on algochat#63 on 2026-10-30, and BASE-3, ENCRYPT-2, AGENT-5.a to AGENT-5.d and KEYS-4.d in hi/: AC1 py-algochat bot and agent one-to-one messages send only hybrid, a 0x04 handshake then 0x05, never 0x01 or 0x02; AC2 when the peer lacks an X25519 key or a signed ML-KEM-768 key, sending refuses with HybridKeyNotFoundError and pays nothing, never falling back to classical; AC3 incoming 0x04 and 0x05 messages are decrypted and read, a 0x05 only under a handshake from the same sender; AC4 incoming 0x01 and 0x02 one-to-one messages are rejected and not read (Leif: 'Ac4: yes'); AC5 discover_encryption_key counts only 32- or 96-byte self-notes as announcements and otherwise uses the header key of the account's own 0x01 messages, matching TypeScript exactly with no 0x04 or 0x05 header fallback; AC6 an announcement with a bad signature is rejected; AC7 regression tests cover these, including the shifted PSK self-note and the rekeyed account; Q1(b) the plain library send path is hybrid-only too, AlgoChat.encrypt refuses with ClassicalSendRefusedError and AlgoChat.encrypt_hybrid sends; AC8 shipped as AlgoChat 1.6.1 with py-algochat 0.6.0 and a CHANGELOG entry (Leif: 'Ac8: idc'); the Python suite, ruff on changed files, specsync check, hi check and bun scripts/validate.ts pass.

## Evidence

- Verification commit: `8c2cbe9c5d43836b6b5dc9065235520386661bba`
- Base commit: `7d7b280ae027b55502a3d16d72ab7afac3f93043`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

algochat#63: the Python bot and agent answered one-to-one messages with classical `0x01` envelopes (and `0x02` with a PSK), while Raven and the other clients moved to hybrid `0x04`/`0x05`. `discover_encryption_key` also read any self-note as a key, so a `0x02` PSK self-note shifted by its header was taken as an X25519 key, a forged 96-byte announcement was used unverified, and an account that rekeyed kept its old key.

Leif's decisions (algochat#63 thread, 2026-10-30, relayed at 12:49 MDT): "Ac4: yes", "Ac8: idc", "Just fix this and use the standard omg". AlgoChat and Raven use only protocol `0x03` and up. That amends BASE-3 and ENCRYPT-2 (Q1(b): the plain library send path is hybrid-only and refuses), and key discovery matches TypeScript exactly (Q2).

docs/RELEASE.md and py/docs/run-your-own-bot.md belong to the open docs PR #62 and are not touched here.

`public_contract` is answered `no` for the root canonical specs (protocol, release, godot), which do not change, following the earlier Python bot changes. The py-algochat API does change (`AlgoChat.encrypt` refuses; 0.6.0, breaking); that contract lives in py/specs (algochat v9, agent v8), updated in place. Answering `yes` would need a protocol or release delta, which waits on PROTOCOL.md 5.4.3/5.7 and on #62 (docs/RELEASE.md). Leif decides at approval.

## From the change's design.md

# Design

`HybridDirect` keeps three maps: outbound sessions per peer (with the peer's ML-KEM key hash, so a key change opens a new handshake), inbound sessions by handshake id with their sender, and its own handshakes by id with their receiver. Ingesting a handshake is idempotent. A `0x05` opens only when its handshake's sender is the transaction's sender (or, for its own notes, the receiver matches). `seal` returns the notes to pay; every note passes `require_hybrid_note`. `AgentCore._pay_direct` checks every note before paying any and forgets the session when the handshake payment fails. On first contact `encrypt_hybrid` rebuilds sessions from the chain, oldest first, so a restarted bot keeps its session.

Key discovery follows TypeScript `paginatedKeyDiscovery`: notes sent by the address only, in indexer order; 32/96-byte self-notes are announcements, a verified 96-byte one wins at once, a forged one is skipped, the first unverified candidate (32-byte announcement or `0x01` header key) is the fallback.

## From the change's testing.md

# Testing

| AC | Evidence |
| --- | --- |
| AC1 | `py/tests/test_agent_direct.py::test_ac1_the_bot_sends_only_a_handshake_then_hybrid_messages`, `test_ac1_a_restarted_bot_reuses_its_session_from_the_chain`, `test_ac1_a_peer_that_changes_its_keys_gets_a_new_handshake`, `test_ac1_a_classical_note_can_never_be_paid_for`; localnet `test_agent_direct_localnet.py` checks every bot note is `0x02 0x04`/`0x02 0x05` with one handshake. |
| AC2 | `test_ac2_no_hybrid_keys_refuses_and_never_falls_back`, `test_ac2_a_failed_handshake_payment_opens_a_new_session_next_time`, `test_client.py::TestClassicalSendIsRefused`. |
| AC3 | `test_ac3_hybrid_messages_are_read_and_a_reply_cites_them`, `test_ac3_a_hybrid_message_under_another_accounts_handshake_is_not_read`, `test_the_plain_library_sends_hybrid_and_reads_it_back`; localnet TypeScript, Go, Rust and Python tools write hybrid messages the bot answers, and each opens the bot's replies. |
| AC4 | `test_ac4_classical_notes_to_the_bot_are_rejected_unread`. |
| AC5 | `test_blockchain.py::TestDiscoveryMatchesTypeScript` (all six tests). |
| AC6 | `TestParseKeyAnnouncement::test_rejects_key_with_invalid_signature`, `TestDiscoveryMatchesTypeScript::test_a_signed_announcement_wins_over_earlier_candidates`. |
| AC7 | `test_a_psk_self_note_is_never_read_as_a_key`, `test_a_rekeyed_account_falls_back_to_its_own_header_key`, `test_ac7_a_restarted_bot_does_not_answer_hybrid_messages_twice`. |

Results (2026-10-30, Linux x86_64, native local network from `py/scripts/native-localnet.sh`, Kotlin tools built with `./gradlew pqioClasspath`): `ALGOCHAT_REQUIRE_LOCALNET=1 ALGOCHAT_LOCALNET=1 python -m pytest` 725 passed, 199 skipped (the skips are the recorded cross-implementation envelope files and the optional goal cross-check), 0 failed. Every cross-language LocalNet test ran with TypeScript, Go, Rust, Python and Kotlin. The CLI/MCP and policy LocalNet tests now publish the people's and bots' ML-KEM-768 keys, because one-to-one messages are hybrid only; no assertion was loosened.

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
