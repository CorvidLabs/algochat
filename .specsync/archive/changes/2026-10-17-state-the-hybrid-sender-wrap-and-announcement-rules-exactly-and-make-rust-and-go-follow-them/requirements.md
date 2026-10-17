---
change: state-the-hybrid-sender-wrap-and-announcement-rules-exactly-and-make-rust-and-go-follow-them
artifact: requirements
---

# Requirements

The recipient session key SHALL still use both shared secrets. The sender copy SHALL use X25519(sender, ephemeral) concatenated with an ML-KEM shared secret from a ciphertext to the sender. A handshake SHALL be 2366 bytes. Rust SHALL initiate from the recipient public keys. An ACPQ note SHALL NOT parse as an X25519 key. A bad ACPQ signature SHALL be rejected.
