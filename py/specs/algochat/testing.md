---
spec: algochat.spec.md
---

## Requirement Coverage

- `REQ-algochat-001`: `test_crypto.py`, `test_keys.py`, `test_models.py`, and `test_vectors.py`.
- `REQ-algochat-002`: always-run evidence comes from `test_models.py`, `test_psk.py`, and `test_vectors.py`;
  `test_cross_impl.py` adds conditional sibling-fixture evidence when `../test-algochat` is available.
- `REQ-algochat-003`: `test_psk.py`.
- `REQ-algochat-004`: `test_storage.py`, `test_queue.py`, `test_signature.py`, `test_blockchain.py`, and `test_client.py`.
- `REQ-algochat-005`: the Fledge `verify` lane runs Ruff and Pytest; the pinned SpecSync 5.0.1 workflow gate runs strict lifecycle validation at 100% coverage before Trust.
- `REQ-algochat-006`: `test_crypto.py` and `test_psk.py`.

## Additional shipped PQ evidence

`tests/test_pq.py` covers `test_mlkem_key_and_decapsulation_match_fixture`, `test_combiner_pin`, `test_handshake_note_accept_and_sender_reopen`, `test_round_trip_and_flipped_byte_fails`, `test_payload_budget_uses_78_byte_header`, and `test_acpq_announcement_is_not_an_x25519_key` against the committed `vectors/pq-mlkem768.json`. These test names describe existing evidence; this documentation audit does not claim a fresh native test run.
