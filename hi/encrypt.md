---
hi: 1
families: [ENCRYPT]
---

# Encrypt

## Intent

The note is a private memo on a public payment. Only the two of us can read it, and a flipped bit should just fail.

## Criteria

- **ENCRYPT-1**  Only the sender and recipient can read a message.
  - **ENCRYPT-1.a**  If someone tampers with the bytes, decryption fails closed and never leaks plaintext.
- **ENCRYPT-2**  When we both have a post-quantum key, a message stays private even if X25519 is later broken, and a person without that key still gets a classical message.
