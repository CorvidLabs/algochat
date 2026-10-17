---
change: state-the-hybrid-sender-wrap-and-announcement-rules-exactly-and-make-rust-and-go-follow-them
artifact: tasks
---

# Tasks

- [x] State the wrap KDF and associated data in PROTOCOL.md
- [x] Seal the sender copy with X25519 and ML-KEM in all six libraries
- [x] Rust initiates from the recipient public keys
- [x] Rust discovery returns nothing for ACPQ
- [x] Go and Rust reject a bad ACPQ signature
- [x] TypeScript flips ciphertext byte 78
