---
module: protocol
version: 11
status: stable
files:
  - PROTOCOL.md
  - TEST-VECTORS.md
---

# protocol

## Purpose

The public wire format lives in PROTOCOL.md. Version 1.3.0 adds optional protocols `0x04` and `0x05`. PQ levels are the integers 0 through 5 in section 5.4.2. Group mailbox protocols `0x06` and `0x07` are implemented at PQ level 3 and are not in tag v1.3.0. Everyday and Extra lock accept envelope versions `0x01` and `0x02`. Protocol `0x03` is the public room administration record and has no PQ level. Tag v1.3.0 does not include `0x03`.

Documentation of current source adds offset tables and [application flow diagrams](../../docs/PROTOCOL-FLOWS.md), including separate cryptographic and authorization checks. The flow guide records port-specific limitations without relaxing normative requirements or qualifying a release.

## Public API

PROTOCOL.md section 5.4.2 is the PQ level table. Section 5.7 is the hybrid contract. Section 5.8 is the group contract, including room administration `0x03`. TEST-VECTORS.md pins the hybrid session key and points at vectors/group-v1.json and vectors/group-admin-v1.json.

## Invariants

A handshake note is 2366 bytes. A `0x05` header is 78 bytes. The recipient session key uses both shared secrets. The sender copy also uses both the sender's X25519 secret and the sender's ML-KEM secret. A legacy `0x06` note is 195 bytes. A `0x06` action-5 delivery is 227 bytes. A `0x07` header is 54 bytes and the plaintext maximum is 4026 bytes. `0x06` and `0x07` are PQ level 3. `0x03` is public and has no PQ level.

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
| 2026-10-18 | specify-the-group-mailbox-membership-wrap-and-one-message-note: Specify the group mailbox, membership wrap, and one message note |
| 2026-10-18 | implement-protocols-0x06-and-0x07-in-all-six-libraries-and-prove-the-localnet-group-mailbox: Implement 0x06 and 0x07 in all six libraries and record LocalNet rounds 46313 through 46322 |
| 2026-10-18 | state-the-pq-level-of-every-assigned-protocol-in-one-table: State the PQ level of every assigned protocol in one table |
| 2026-10-18 | number-the-pq-level-of-every-protocol-from-0-through-5: Number the PQ level of every protocol from 0 through 5 |
| 2026-10-18 | Merge main: keep levels 0 through 5 and assign group protocols 0x06 and 0x07 to level 3 |
| 2026-10-18 | Assign protocol 0x03 as the public room administration record. Legacy 0x06 actions 1–4 stay 195 bytes. Action 5 is the 227-byte key delivery. Section 5.8.4 stays the historical membership run. |
| 2026-10-18 | public-room-administration-on-the-group-mailbox-with-the-same-rules-in-every-language: Public room administration on the group mailbox, with the same rules in every language |
| 2026-10-19 | Clarify existing 0x03–0x07 layouts and application responsibilities; add source-grounded flow diagrams and explicit implementation/evidence limits. |
