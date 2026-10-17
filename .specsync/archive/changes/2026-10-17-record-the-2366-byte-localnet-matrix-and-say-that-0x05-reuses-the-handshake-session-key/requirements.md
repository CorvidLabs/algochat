---
change: record-the-2366-byte-localnet-matrix-and-say-that-0x05-reuses-the-handshake-session-key
artifact: requirements
---

# Requirements

Everyday and Extra lock messages SHALL keep a fresh ephemeral key. A 0x05 message SHALL reuse the session key from its 0x04 handshake. PARITY.md SHALL record rounds 41641 through 41736 and mark rounds 41059 through 41154 as the withdrawn 1278-byte layout.
