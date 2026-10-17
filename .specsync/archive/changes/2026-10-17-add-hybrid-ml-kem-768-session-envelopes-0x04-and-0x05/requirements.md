---
change: add-hybrid-ml-kem-768-session-envelopes-0x04-and-0x05
artifact: requirements
---

# Requirements

A pair with ML-KEM keys can complete one 1278-byte handshake and then exchange 0x05 messages. A peer without that key still uses 0x01 or 0x02. Tamper fails closed.
