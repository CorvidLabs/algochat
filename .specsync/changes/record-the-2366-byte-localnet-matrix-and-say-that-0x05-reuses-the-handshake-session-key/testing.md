---
change: record-the-2366-byte-localnet-matrix-and-say-that-0x05-reuses-the-handshake-session-key
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| REQ-protocol-1 | PROTOCOL.md design goal 2 says a 0x05 message reuses the handshake session key. PARITY.md records LocalNet rounds 41641 through 41736. Rust, Go, Kotlin, and Swift tests reject ciphertext byte 78 and a sender wrap opened with the wrong ML-KEM key. |
