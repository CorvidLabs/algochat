---
module: protocol
version: 2
status: stable
files:
  - PROTOCOL.md
  - TEST-VECTORS.md
---

# protocol

## Purpose

The public wire format lives in PROTOCOL.md. Version 1.3.0 adds optional protocols `0x04` and `0x05`. Versions `0x01` and `0x02` stay. Identifier `0x03` is not assigned.

## Public API

PROTOCOL.md section 5.7 is the contract. TEST-VECTORS.md pins the hybrid session key.

## Invariants

A handshake note is 1278 bytes. A `0x05` header is 78 bytes. Both shared secrets are required for the session key.

## Behavioral Examples

Seeds `0x11` and `0x22` with ML-KEM coins `0x33` produce one handshake that both parties open. The combiner vector session key is `9b393e8cec553ada4821c1fa04b40bf499446b19ca9218fd8dcf8b705e06d734`.

## Dependencies

ML-KEM-768 from the implementation's post-quantum library. TypeScript uses @noble/post-quantum 0.7.1. X25519 and ChaCha20-Poly1305 stay as in 1.2.1.

## Error Cases

A flipped `0x05` byte fails decryption. An `ACPQ` note is not an X25519 announcement. A bad announcement signature is rejected.
## Change Log

| Date | Change |
|------|--------|
| 2026-10-17 | add-hybrid-ml-kem-768-session-envelopes-0x04-and-0x05: Add hybrid ML-KEM-768 session envelopes 0x04 and 0x05 |
