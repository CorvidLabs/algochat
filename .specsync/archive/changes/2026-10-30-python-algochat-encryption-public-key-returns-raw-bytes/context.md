---
change: python-algochat-encryption-public-key-returns-raw-bytes
artifact: context
---

# Context

`AlgoChat.encryption_public_key` in py/ is annotated `-> bytes` and documented as the user's encryption public key, but it returned the `X25519PublicKey` object. Passing it to `sign_encryption_key` or concatenating it into a key-announcement note raised `TypeError`. Found on Oct 29, 2026 while running the agent core's localnet tests (algochat#49), which had to work around it.
