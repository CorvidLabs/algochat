---
spec: cross-vectors.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| tests/cross_impl.rs external groups | Rust integration | Standard and PSK envelopes from sibling implementations when present. |
| Standard v2 KAT | Deterministic integration | Exact proposal-0001 standard bytes and plaintext. |
| PSK v2 KAT | Deterministic integration | Exact hybrid/ratchet bytes and plaintext. |
| Header tamper vector | Security integration | Authenticated header mutation is rejected. |
| Identity vector | Security integration | Announcement identity binding. |

## Manual Testing

Review output to distinguish explicit optional-fixture skips from mandatory embedded vectors.

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| Optional directory absent | Scoped skip; embedded tests still run. |
| Fixture present but malformed | Its implementation group fails. |
| Unicode or byte content drifts | Exact comparison fails. |
| Known-answer bytes change | Deterministic vector fails. |
| Tampered header succeeds | Security vector fails. |

## Mesh process boundary

`src/bin/pqcross.rs` exposes `identity`, `write`/`read`, `write01`/`read01`, `write02`/`read02`, and `write05s` operations for the external mesh driver. Native compilation establishes only that the wrapper builds; live chain claims require the harness's actual transaction evidence. `src/pq.rs::tests::live_localnet_note` reads optional `/tmp/pq-live.json`; it does not submit a transaction itself.
