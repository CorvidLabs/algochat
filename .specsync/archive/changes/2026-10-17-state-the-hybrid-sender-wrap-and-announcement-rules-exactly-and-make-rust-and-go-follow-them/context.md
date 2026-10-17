---
change: state-the-hybrid-sender-wrap-and-announcement-rules-exactly-and-make-rust-and-go-follow-them
artifact: context
---

# Context

Two independent reviews of commit 2e4eca6 held the pull request. The sender copy of the hybrid session key was sealed with X25519 alone, so a break of X25519 opened the messages without breaking ML-KEM. Rust also required the recipient account seed to start a handshake, and its X25519 discovery parser treated an ACPQ note as a key.

The wire format is not tagged. The fix changes the handshake before 1.3.0 is frozen. The 1278-byte LocalNet matrix is withdrawn.
