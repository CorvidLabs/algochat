---
change: raise-the-algochat-note-ceiling-to-4096-bytes-and-price-allowed-notes-with-the-consensus-surcharge-on-one-minimum-fee
artifact: context
---

# Context

Algorand consensus allows a transaction note of 4096 bytes. 4097 is rejected. The first 1024 bytes cost one minimum fee. Each byte past 1024 adds one ten-thousandth of the minimum fee, rounded up once.

This package previously capped standard plaintext at 882 bytes so the encoded note stayed within 1024 bytes. Protocol revision 1.2.1 keeps envelope version 0x01 and the 126-byte standard header. The 16-byte Poly1305 tag is unchanged. The new standard plaintext maximum is 3954 bytes, which encodes to exactly 4096 bytes.

Protocol ID 0x02 remains a reserved constant. This package does not implement PSK envelopes, so it does not grow a 130-byte header or a 3950-byte PSK plaintext limit. It also has no Falcon signer. Note fees therefore use one minimum fee plus the surcharge, not three minimum fees.

Do not change the Go module path. There is no package version constant, so the library version stays with the later tag v0.2.0. Do not tag from this change.
