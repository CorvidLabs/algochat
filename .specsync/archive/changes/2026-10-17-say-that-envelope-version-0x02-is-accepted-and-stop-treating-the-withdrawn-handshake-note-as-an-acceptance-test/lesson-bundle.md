# Lesson bundle: say-that-envelope-version-0x02-is-accepted-and-stop-treating-the-withdrawn-handshake-note-as-an-acceptance-test

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Say that envelope version 0x02 is accepted, and stop treating the withdrawn handshake note as an acceptance test
- **Kind**: Documentation
- **Specs**: protocol
- **Paths**: TEST-VECTORS.md
- **Acceptance**: TEST-VECTORS.md no longer says version 0x02 is unsupported. PARITY.md limits vectors/pq-mlkem768.json acceptance to the encapsulation key, ciphertext, shared secret, and combiner. The 1278-byte handshake_note is not an acceptance test.

## Evidence

- Verification commit: `9104d05a3fe0b803184fd335a8fd0e75712110c4`
- Base commit: `620e6b72860844250fcf37f77e0a94c8cc01e1ae`
- Verified by: `specsync check --spec protocol`

## From the change's context.md

# Context

A change request on 620e6b7 showed that the parity checklist still required opening vectors/pq-mlkem768.json handshake_note. That note is 1278 bytes. Current handshakes are 2366 bytes. The same review found TEST-VECTORS.md still listing version 0x02 as unsupported.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| REQ-protocol-2 | TEST-VECTORS.md test case 2.2 no longer lists version 0x02 as unsupported. PARITY.md does not require opening handshake_note. Go and Rust tests accept a valid ACPQ signature. |

## Where these lessons go

- `specs/protocol/context.md`
