---
change: python-algochat-encryption-public-key-returns-raw-bytes
artifact: requirements
---

# Requirements

- KEY-2 (hi/key.md): a Python caller can take `AlgoChat.encryption_public_key` and publish it as is (sign it with `sign_encryption_key` and put it in the note).
- KEY-1.a (hi/key.md): the value is the raw 32-byte X25519 public key derived from the account, the same bytes the other implementations derive.
