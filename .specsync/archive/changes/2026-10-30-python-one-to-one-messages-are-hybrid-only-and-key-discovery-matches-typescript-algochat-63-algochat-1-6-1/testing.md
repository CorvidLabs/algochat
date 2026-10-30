---
change: python-one-to-one-messages-are-hybrid-only-and-key-discovery-matches-typescript-algochat-63-algochat-1-6-1
artifact: testing
---

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
