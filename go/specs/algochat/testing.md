---
spec: algochat.spec.md
---

## Test Plan

- Run all existing cryptography, envelope, account, signature, queue, model, and storage tests with the race detector.
- An 882-byte plaintext encrypts and encodes to 1024 bytes.
- A 3954-byte plaintext encrypts and encodes to 4096 bytes, and one extra byte fails before an envelope is returned.
- `PaymentFee` at minFee 1000 returns 1000, 1098, and 1308 for notes of 1024, 2000, and 4096 bytes, and rejects 4097.

- Build, vet, and race-test all packages on Go 1.25 in the Trust lane.
- Preserve the repository's existing Go-version compatibility matrix independently.
