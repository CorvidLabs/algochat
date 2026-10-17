# Lesson bundle: record-the-2366-byte-localnet-matrix-and-say-that-0x05-reuses-the-handshake-session-key

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Record the 2366-byte LocalNet matrix and say that 0x05 reuses the handshake session key
- **Kind**: Documentation
- **Specs**: protocol
- **Paths**: PROTOCOL.md, PARITY.md
- **Acceptance**: PROTOCOL.md says everyday and Extra lock messages use a fresh ephemeral key, and a 0x05 message reuses the handshake session key. PARITY.md records LocalNet rounds 41641 through 41736 for the 2366-byte handshake and marks rounds 41059 through 41154 as withdrawn.

## Evidence

- Verification commit: `a8ac47ed0eed33bccccfe23ed40e999de1333ba5`
- Base commit: `7a3c964ede48b01c5abff4929f9b6db880494724`
- Verified by: `specsync check --spec protocol`

## From the change's context.md

# Context

A review of 7a3c964 passed the 2366-byte wire format on macOS and reported a fresh LocalNet matrix, rounds 41641 through 41736. The overview still said every message uses a fresh ephemeral key, which is not true for 0x05. The older LocalNet citation was still easy to read as current.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| REQ-protocol-1 | PROTOCOL.md design goal 2 says a 0x05 message reuses the handshake session key. PARITY.md records LocalNet rounds 41641 through 41736. Rust, Go, Kotlin, and Swift tests reject ciphertext byte 78 and a sender wrap opened with the wrong ML-KEM key. |

## Where these lessons go

- `specs/protocol/context.md`
