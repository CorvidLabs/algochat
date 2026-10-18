---
spec: algochat.spec.md
---

## Maintenance Tasks

- Preserve standard and PSK protocol vectors when changing protocol code.
- Keep the 4096-byte note ceiling, the 3954 and 3950 plaintext maxima, and the note-fee surcharge aligned with consensus.
- Update stable requirement evidence when public protocol behavior changes.
- Keep lifecycle, lint, and deterministic tests blocking in the Trust lane.

- [x] Inventory `pq.py` and document all 29 shipped PQ package exports against source and existing tests.
- [x] Correct README PSK usage to import `os` and serialize validate/decrypt/record in the documented order.
- [ ] Resolve and verify the implementation gaps recorded in the [accuracy ledger](../../../docs/ACCURACY.md) through separately approved implementation work.
