---
change: python-algochat-encryption-public-key-returns-raw-bytes
artifact: testing
---

# Testing

- `py/tests/test_client.py::TestFromSeed::test_derives_encryption_key` now asserts `bytes`, 32 bytes long, equal to the raw encoding of the private key object. `pytest` in py/: 353 passed, 198 skipped.
- Localnet (Linux, go-algorand 5.0.5 dev mode + indexer 3.11.1, local only, accounts funded from the localnet KMD wallet): two fresh accounts published `encryption_public_key` plus its Ed25519 signature, each discovered the other's key as verified and equal to the property, and an encrypted message sent with it was read back by the receiver. Passed. The reusable localnet suite lands with algochat#49; once both merge, that suite drops its workaround.
