# Lesson bundle: prove-on-localnet-that-all-six-libraries-read-and-write-0x01-0x02-0x04-and-0x05-notes-for-empty-small-large-and-maximum

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Prove on LocalNet that all six libraries read and write 0x01, 0x02, 0x04, and 0x05 notes for empty, small, large, and maximum plaintext, including several messages in one exchange. Go gains Extra lock. Every library accepts version 0x02 header binding the way TypeScript emits it. Identifier 0x03 stays unassigned.
- **Kind**: Feature
- **Specs**: protocol
- **Paths**: PROTOCOL.md, PARITY.md, README.md, implementations.json, docs, ts, go, rs, py, kt, swift, Package.swift
- **Acceptance**: On LocalNet, each library writes 0x01, 0x02, 0x04, and 0x05 notes for empty, small, large, and maximum plaintext, plus several messages in one exchange. Every other library opens those confirmed notes. Version 0x02 header binding matches TypeScript. Go implements Extra lock. Identifier 0x03 is not used.

## Evidence

- Verification commit: `1865422497844d3b44321fbed3e06a0cc8ed6b83`
- Base commit: `76dcba487d1c83c233f2915f86ca15eba418137b`
- Verified by: `specsync check --spec protocol`

## From the change's context.md

# Context

The 6x6 LocalNet mesh only sent one small `0x05` body per library. It did not cover `0x01`, `0x02`, empty notes, large notes, maximum notes, or several messages in one exchange.

TypeScript's default everyday and Extra lock notes use version byte `0x02`. The payload AEAD binds the full fixed header, including the wrapped sender key. The sender-key wrap itself has empty associated data. Rust's `encrypt_message_v2` binds a shorter prefix on both AEAD operations, so it does not open a TypeScript note. Python, Go, Kotlin, and Swift accept only version `0x01`. Go does not implement Extra lock.

Identifier `0x03` stays unassigned. Do not put Raven's private sender authentication into this repository.

## From the change's design.md

# Design

Version `0x02` for protocol `0x01` binds the 126-byte header as payload associated data: version, protocol, sender X25519, ephemeral X25519, nonce, wrapped sender key. The sender-key wrap uses empty associated data. Protocol `0x02` does the same with the 130-byte header, which inserts the 4-byte big-endian ratchet counter after the protocol byte.

Version `0x01` keeps empty associated data for both operations. Decoders accept both versions. A version `0x02` note must fail if the header is rewritten and decrypted with empty associated data.

Rust's shorter v2 prefix is replaced by this TypeScript layout. Go gains encode, decode, encrypt, and decrypt for Extra lock, including the two-level ratchet used by the other libraries.

The LocalNet driver submits each note and passes only the confirmed bytes to every reader.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| REQ-protocol-2 | `ts/scripts/pq-matrix-localnet.ts` submitted 90 notes on LocalNet, rounds 41059 through 41154. Every library opened every note. Version 0x02 header binding matches TypeScript. Go Extra lock is in `go/psk.go`. |

LocalNet must be up. The driver funds two accounts and, for each library, submits:

- four `0x01` notes: empty, small, large, maximum
- four `0x02` notes at those sizes, then three more at counters 0, 1, and 2
- one `0x04` handshake and four `0x05` notes at those sizes

Every library opens every confirmed note. A header rewrite on a version `0x02` note fails closed. Existing `0x01` and `0x02` unit tests still pass.

## Where these lessons go

- `specs/protocol/context.md`
