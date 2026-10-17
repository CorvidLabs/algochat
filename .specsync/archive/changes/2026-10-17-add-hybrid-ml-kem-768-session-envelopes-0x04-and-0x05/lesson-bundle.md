# Lesson bundle — add-hybrid-ml-kem-768-session-envelopes-0x04-and-0x05

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Add hybrid ML-KEM-768 session envelopes 0x04 and 0x05
- **Kind**: Feature
- **Specs**: protocol
- **Paths**: PROTOCOL.md, TEST-VECTORS.md, hi/encrypt.md, ts, implementations.json, README.md
- **Acceptance**: TypeScript can announce an ML-KEM key, complete a 1278-byte handshake, and decrypt a 0x05 message. The pinned combiner vector matches TEST-VECTORS.md. 0x01 and 0x02 tests still pass.

## Evidence

- Verification commit: `8c7eddd0b366a0c2cc3bb62e35550094daed5fad`
- Base commit: `69ed4d66251348eff02833f5d2c68f73e5723cec`
- Verified by: `specsync check --spec protocol`

## From the change's context.md

# Context

Everyday notes are X25519. Falcon authorizes the payment and does not hide the text. A 4096-byte note can hold an ML-KEM-768 ciphertext in one handshake. Identifier 0x03 stays unassigned.

## From the change's design.md

# Design

Section 5.7 of PROTOCOL.md. TypeScript in ts/src/pq uses @noble/post-quantum ML-KEM-768 and the HKDF combiner pinned in TEST-VECTORS.md. Other languages follow that vector in later commits of this release.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| REQ-protocol-1 | `ts/src/pq/pq.test.ts` covers the handshake, the 0x05 round trip, tamper, and the pinned combiner. `bun test` in ts covers 0x01 and 0x02 as well. |

## Where these lessons go

- `specs/protocol/context.md`
