---
change: state-the-hybrid-sender-wrap-and-announcement-rules-exactly-and-make-rust-and-go-follow-them
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| REQ-protocol-1 | TypeScript, Go, Rust, Python, Kotlin, and Swift PQ tests open a 2366-byte handshake on both sides. Opening with the wrong ML-KEM key fails. A flipped 0x05 ciphertext byte fails. |

LocalNet for the new layout has not been run. Do not tag until it has.
