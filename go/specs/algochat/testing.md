---
spec: algochat.spec.md
---

## Test Plan

- Run all existing cryptography, envelope, account, signature, queue, model, and storage tests with the race detector.
- An 882-byte plaintext encrypts and encodes to 1024 bytes.
- A 3954-byte plaintext encrypts and encodes to 4096 bytes, and one extra byte fails before an envelope is returned.
- `PaymentFee` at minFee 1000 returns 1000, 1098, and 1308 for notes of 1024, 2000, and 4096 bytes, and rejects 4097.
- `DecodeEnvelope` accepts a 4097-byte header-valid note. `DecryptMessage`, `DecryptPSKMessage`, and `DecryptPQMessage` reject an authenticated 4097-byte note with `ErrNoteTooLarge` and do not return plaintext. Outbound max-plus-one still fails before an envelope or note is returned.
- `EncryptPSKMessage`/`DecryptPSKMessage` round-trip `math.MaxUint32` without wrapping the wire counter to 0. Decrypting that note twice still succeeds, so the library has no replay state.

- Build, vet, and race-test all packages on Go 1.25 in the Trust lane.
- The nested standalone Go-version matrix is historical; the active root workflow selects Go 1.25. The earlier accepted matrix requirement remains unreconciled; see the [accuracy ledger](../../../docs/ACCURACY.md).
- `pq_test.go`, root `vectors/` and `cmd/pqcross` cover hybrid key derivation, handshake/session data and compatibility fixtures; they do not establish high-level transport or replay persistence.
