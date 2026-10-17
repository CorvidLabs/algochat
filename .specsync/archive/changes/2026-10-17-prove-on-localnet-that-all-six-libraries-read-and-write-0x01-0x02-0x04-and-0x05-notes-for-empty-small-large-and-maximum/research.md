---
change: prove-on-localnet-that-all-six-libraries-read-and-write-0x01-0x02-0x04-and-0x05-notes-for-empty-small-large-and-maximum
artifact: research
---

# Research

PROTOCOL.md section 10 filters on prefixes `0x0101` and `0x0102`. TypeScript `ts/src/crypto/aad.ts` and `ts/src/psk/encryption.ts` emit version `0x02` and bind the full header on the payload only. Rust `standard_v2_aad` and `PSKEnvelope::v2_aad` stop before the wrapped sender key and bind that prefix on both operations. Go `doc.go` says protocol `0x02` is reserved.
