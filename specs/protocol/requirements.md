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

PROTOCOL.md section 5.4.2 SHALL be the post-quantum level of every assigned protocol, as an integer from 0 to 5. Levels 1 through 5 SHALL mean the NIST categories. Level 0 SHALL mean that Shor's algorithm breaks the key exchange and no category 1 through 5 primitive is required. Everyday `0x01` SHALL be level 0. Extra lock `0x02` SHALL be level 1 while the 32-byte pre-shared key stays secret, and level 0 if that secret is lost or low entropy. Hybrid `0x04` and `0x05` SHALL be level 3. Identifier `0x03` SHALL NOT be assigned. Levels 2, 4, and 5 SHALL NOT be claimed for a message protocol in this version. A future group key wrap SHALL be level 3 when hybrid keys are available, and at least level 1 otherwise. Level 0 does not meet that bar.

#### Acceptance Criteria

- Section 5.4.2 defines levels 0 through 5 and assigns `0x01` to 0, `0x02` to 1, and `0x04` and `0x05` to 3.
- SECURITY.md and the repository README use those integers.
- No assigned protocol is given a second, conflicting level.

