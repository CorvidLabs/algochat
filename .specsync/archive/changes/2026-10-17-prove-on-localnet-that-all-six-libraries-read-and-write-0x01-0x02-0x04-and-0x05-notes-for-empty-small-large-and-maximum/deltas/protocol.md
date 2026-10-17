## Added

### REQUIREMENT REQ-protocol-2

An implementation SHALL accept envelope version `0x01` with empty associated data and version `0x02` with the TypeScript header binding. For version `0x02`, the payload AEAD associated data SHALL be the full fixed header, including the wrapped sender key, and the sender-key wrap SHALL use empty associated data. This rule applies to protocol `0x01` (126-byte header) and protocol `0x02` (130-byte header). Identifier `0x03` SHALL NOT be assigned. A note confirmed on LocalNet for empty, small, large, or maximum plaintext SHALL open in every other library.

#### Acceptance Criteria

- A version `0x02` note written by TypeScript opens in Go, Rust, Python, Kotlin, and Swift.
- A version `0x01` note written by Python opens in the other five libraries.
- Rewriting the version byte of a version `0x02` note fails decryption.
- Go writes and opens an Extra lock note.
- The LocalNet matrix covers empty, small, large, and maximum plaintext for `0x01`, `0x02`, and `0x05`, and one `0x04` handshake per library.
