---
spec: psk.spec.md
---

## Tasks

- [x] Inventory PSK crypto, envelope, exchange, ratchet, state, and type files.
- [x] Document all member-level public symbols and security invariants.
- [x] Bind requirements to unit and proposal-0001 vectors.

## Gaps

No migration-specific behavior gap is accepted.

## Review Sign-offs

- **Contract definition**: portable lifecycle approval
- **Verification**: native SpecSync evidence
- **Design**: n/a
- **Implementation review**: governance/spec-only diff

- [x] Correct the PSK-v2 full-header AAD description without changing runtime behavior.
- [x] Fail before wrapping the send counter, persist exhaustion, and bound the receive window by 200 in both directions.
