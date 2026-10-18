---
spec: protocol.spec.md
---

# Requirements

### REQ-protocol-1

An implementation SHALL derive the hybrid session key with HKDF-SHA256 over the X25519 shared secret concatenated with the ML-KEM-768 shared secret, using the transcript in PROTOCOL.md section 5.7. A handshake SHALL be one 2366-byte note with protocol id 0x04. The sender copy SHALL be sealed under X25519(sender, ephemeral) concatenated with an ML-KEM shared secret for a ciphertext to the sender. A following message SHALL use protocol id 0x05 and SHALL reuse that session key. Identifier 0x03 SHALL NOT be assigned by this version.

#### Acceptance Criteria

- The combiner vector in TEST-VECTORS.md matches.
- A 0x04 note is 2366 bytes and both parties derive the same session key.
- Opening the sender copy with only the X25519 secret fails.
- A flipped 0x05 byte fails decryption.
- A 0x05 message does not mint a new ephemeral session key.

### REQ-protocol-2

An implementation SHALL accept envelope version `0x01` with empty associated data and version `0x02` with the TypeScript header binding. For version `0x02`, the payload AEAD associated data SHALL be the full fixed header, including the wrapped sender key, and the sender-key wrap SHALL use empty associated data. This rule applies to protocol `0x01` (126-byte header) and protocol `0x02` (130-byte header). Identifier `0x03` SHALL NOT be assigned. A note confirmed on LocalNet for empty, small, large, or maximum plaintext SHALL open in every other library. TEST-VECTORS.md SHALL present version `0x02` with protocol `0x01` or `0x02` as accepted. The withdrawn 1278-byte handshake note SHALL NOT be an acceptance test. The encapsulation key, ciphertext, ML-KEM shared secret, and combiner in `vectors/pq-mlkem768.json` stay valid.

#### Acceptance Criteria

- A version `0x02` note written by TypeScript opens in Go, Rust, Python, Kotlin, and Swift.
- A version `0x01` note written by Python opens in the other five libraries.
- Rewriting the version byte of a version `0x02` note fails decryption.
- Go writes and opens an Extra lock note.
- The LocalNet matrix covers empty, small, large, and maximum plaintext for `0x01`, `0x02`, and `0x05`, and one `0x04` handshake per library.
- TEST-VECTORS.md does not call version `0x02` unsupported.
- Opening `handshake_note` from `vectors/pq-mlkem768.json` is not required.

### REQ-protocol-3

PROTOCOL.md section 5.4.2 SHALL be the post-quantum level of every assigned protocol. Everyday `0x01` SHALL be recorded as X25519 only. Extra lock `0x02` SHALL be recorded as still requiring the pre-shared key after a break of X25519, while that key stays secret. Hybrid `0x04` SHALL be recorded as requiring both the X25519 shared secret and the ML-KEM-768 shared secret. Hybrid `0x05` SHALL be recorded as the same level as its handshake, and the session key SHALL open every `0x05` note in that handshake. Identifier `0x03` SHALL NOT be assigned. A future group key wrap SHALL meet the Extra lock level or the hybrid level. A wrap that is only everyday `0x01` does not meet that bar.

#### Acceptance Criteria

- Section 5.4.2 names `0x01`, `0x02`, `0x04`, `0x05`, and unassigned `0x03`.
- SECURITY.md and the repository README point at that section.
- No assigned protocol is given a second, conflicting PQ level.

