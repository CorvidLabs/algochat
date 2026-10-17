---
spec: protocol.spec.md
---

# Requirements

### REQ-protocol-1

An implementation SHALL derive the hybrid session key with HKDF-SHA256 over the X25519 shared secret concatenated with the ML-KEM-768 shared secret, using the transcript in PROTOCOL.md section 5.7. A handshake SHALL be one 2366-byte note with protocol id 0x04. The sender copy SHALL be sealed under X25519(sender, ephemeral) concatenated with an ML-KEM shared secret for a ciphertext to the sender. A following message SHALL use protocol id 0x05. Identifier 0x03 SHALL NOT be assigned by this version.

#### Acceptance Criteria

- The combiner vector in TEST-VECTORS.md matches.
- A 0x04 note is 2366 bytes and both parties derive the same session key.
- Opening the sender copy with only the X25519 secret fails.
- A flipped 0x05 byte fails decryption.

### REQ-protocol-2

An implementation SHALL accept envelope version `0x01` with empty associated data and version `0x02` with the TypeScript header binding. For version `0x02`, the payload AEAD associated data SHALL be the full fixed header, including the wrapped sender key, and the sender-key wrap SHALL use empty associated data. This rule applies to protocol `0x01` (126-byte header) and protocol `0x02` (130-byte header). Identifier `0x03` SHALL NOT be assigned. A note confirmed on LocalNet for empty, small, large, or maximum plaintext SHALL open in every other library.

#### Acceptance Criteria

- A version `0x02` note written by TypeScript opens in Go, Rust, Python, Kotlin, and Swift.
- A version `0x01` note written by Python opens in the other five libraries.
- Rewriting the version byte of a version `0x02` note fails decryption.
- Go writes and opens an Extra lock note.
- The LocalNet matrix covers empty, small, large, and maximum plaintext for `0x01`, `0x02`, and `0x05`, and one `0x04` handshake per library.

