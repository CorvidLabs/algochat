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

### REQ-protocol-4

PROTOCOL.md section 5.8 SHALL specify group membership as protocol `0x06` and a group message as protocol `0x07`. A `0x06` note SHALL use the 78-byte hybrid header with the protocol byte set to `0x06`, SHALL be sealed under an established hybrid session key, and SHALL carry a 101-byte plaintext of action, epoch, group id, mailbox public key, and group key. A `0x07` note SHALL be a payment to the mailbox with a 54-byte header of version, protocol, group id, epoch, per-sender counter, and nonce, and SHALL derive its message key with HKDF-SHA256 info `AlgoChat-group-v1`. The group key wrap SHALL be PQ level 3. An everyday `0x01` wrap SHALL NOT deliver a group key. Identifier `0x03` SHALL NOT be assigned. Parity for `0x06` and `0x07` SHALL NOT be claimed until every library passes the LocalNet test in section 5.8.4.

#### Acceptance Criteria

- Section 5.8 states both headers and the 101-byte membership plaintext.
- The identifier table lists `0x06` and `0x07` as specified and not yet in the parity matrix.
- Section 5.8.4 requires a removed member's open to fail.

