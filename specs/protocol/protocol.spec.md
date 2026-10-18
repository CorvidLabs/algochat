---
module: protocol
version: 7
status: stable
files:
  - PROTOCOL.md
  - TEST-VECTORS.md
---

# protocol

## Purpose

The public wire format lives in PROTOCOL.md. Version 1.3.0 adds optional protocols `0x04` and `0x05`. Everyday and Extra lock accept envelope versions `0x01` and `0x02`. Identifier `0x03` is not assigned.

## Public API

PROTOCOL.md section 5.7 is the contract. TEST-VECTORS.md pins the hybrid session key.

## Invariants

A handshake note is 2366 bytes. A `0x05` header is 78 bytes. The recipient session key uses both shared secrets. The sender copy also uses both the sender's X25519 secret and the sender's ML-KEM secret.

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
| 2026-10-17 | Envelope version 0x02 binds the full everyday or Extra lock header as payload associated data. Version 0x01 stays valid. |
| 2026-10-17 | prove-on-localnet-that-all-six-libraries-read-and-write-0x01-0x02-0x04-and-0x05-notes-for-empty-small-large-and-maximum: Prove on LocalNet that all six libraries read and write 0x01, 0x02, 0x04, and 0x05 notes for empty, small, large, and maximum plaintext, including several messages in one exchange. Go gains Extra lock. Every library accepts version 0x02 header binding the way TypeScript emits it. Identifier 0x03 stays unassigned. |
| 2026-10-17 | state-the-hybrid-sender-wrap-and-announcement-rules-exactly-and-make-rust-and-go-follow-them: State the hybrid sender wrap and announcement rules exactly, and make Rust and Go follow them |
| 2026-10-17 | record-the-2366-byte-localnet-matrix-and-say-that-0x05-reuses-the-handshake-session-key: Record the 2366-byte LocalNet matrix and say that 0x05 reuses the handshake session key |
| 2026-10-17 | say-that-envelope-version-0x02-is-accepted-and-stop-treating-the-withdrawn-handshake-note-as-an-acceptance-test: Say that envelope version 0x02 is accepted, and stop treating the withdrawn handshake note as an acceptance test |
| 2026-10-18 | state-the-pq-level-of-every-assigned-protocol-in-one-table: State the PQ level of every assigned protocol in one table |
