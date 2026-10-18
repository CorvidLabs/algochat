---
spec: protocol.spec.md
---

## Tasks

- [x] Inventory standard envelope, crypto, key, signature, and type files.
- [x] Document every member-level public symbol and v1/v2 invariant.
- [x] Bind requirements to native and embedded interoperability tests.

## Gaps

No migration-specific behavior gap is accepted.

## Review Sign-offs

- **Contract definition**: portable lifecycle approval
- **Verification**: native SpecSync evidence
- **Design**: n/a
- **Implementation review**: governance/spec-only diff

- [x] Correct active standard-v2 full-header AAD descriptions and stale crypto comments.
- [x] Inventory `src/pq.rs` public exports under the protocol contract.
- [ ] Resolve and verify remaining protocol/qualification gaps in the [accuracy ledger](../../../docs/ACCURACY.md) as separately approved work.
