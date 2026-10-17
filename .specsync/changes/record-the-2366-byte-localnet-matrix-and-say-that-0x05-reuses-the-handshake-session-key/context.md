---
change: record-the-2366-byte-localnet-matrix-and-say-that-0x05-reuses-the-handshake-session-key
artifact: context
---

# Context

A review of 7a3c964 passed the 2366-byte wire format on macOS and reported a fresh LocalNet matrix, rounds 41641 through 41736. The overview still said every message uses a fresh ephemeral key, which is not true for 0x05. The older LocalNet citation was still easy to read as current.
