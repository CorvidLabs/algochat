---
spec: protocol.spec.md
---

# Requirements

### REQ-protocol-1

An implementation SHALL derive the hybrid session key with HKDF-SHA256 over the X25519 shared secret concatenated with the ML-KEM-768 shared secret, using the transcript in PROTOCOL.md section 5.7. A handshake SHALL be one 2366-byte note with protocol id 0x04. The sender copy SHALL be sealed under X25519(sender, ephemeral) concatenated with an ML-KEM shared secret for a ciphertext to the sender. A following message SHALL use protocol id 0x05 and SHALL reuse that session key.

#### Acceptance Criteria

- The combiner vector in TEST-VECTORS.md matches.
- A 0x04 note is 2366 bytes and both parties derive the same session key.
- Opening the sender copy with only the X25519 secret fails.
- A flipped 0x05 byte fails decryption.
- A 0x05 message does not mint a new ephemeral session key.

### REQ-protocol-2

An implementation SHALL accept envelope version `0x01` with empty associated data and version `0x02` with the TypeScript header binding. For version `0x02`, the payload AEAD associated data SHALL be the full fixed header, including the wrapped sender key, and the sender-key wrap SHALL use empty associated data. This rule applies to protocol `0x01` (126-byte header) and protocol `0x02` (130-byte header). A version `0x01` note whose protocol byte is `0x03` SHALL NOT be treated as room administration. A note confirmed on LocalNet for empty, small, large, or maximum plaintext SHALL open in every other library. TEST-VECTORS.md SHALL present version `0x02` with protocol `0x01` or `0x02` as accepted. The withdrawn 1278-byte handshake note SHALL NOT be an acceptance test. The encapsulation key, ciphertext, ML-KEM shared secret, and combiner in `vectors/pq-mlkem768.json` stay valid.

#### Acceptance Criteria

- A version `0x02` note written by TypeScript opens in Go, Rust, Python, Kotlin, and Swift.
- A version `0x01` note written by Python opens in the other five libraries.
- Rewriting the version byte of a version `0x02` note fails decryption.
- Go writes and opens an Extra lock note.
- The LocalNet matrix covers empty, small, large, and maximum plaintext for `0x01`, `0x02`, and `0x05`, and one `0x04` handshake per library.
- TEST-VECTORS.md does not call version `0x02` unsupported.
- Opening `handshake_note` from `vectors/pq-mlkem768.json` is not required.

### REQ-protocol-3

PROTOCOL.md section 5.4.2 SHALL be the post-quantum level of every assigned protocol, as an integer from 0 to 5. Levels 1 through 5 SHALL mean the NIST categories. Level 0 SHALL mean that Shor's algorithm breaks the key exchange and no category 1 through 5 primitive is required. Everyday `0x01` SHALL be level 0. Extra lock `0x02` SHALL be level 1 while the 32-byte pre-shared key stays secret, and level 0 if that secret is lost or low entropy. Hybrid `0x04` and `0x05` SHALL be level 3. Group membership `0x06` and group message `0x07` SHALL be level 3, because the group key is wrapped under the hybrid session. Protocol `0x03` SHALL be public room administration and SHALL NOT be given a PQ level, because it carries no key. Levels 2, 4, and 5 SHALL NOT be claimed for a message protocol in this version. Level 0 does not meet the bar for a group key wrap.

#### Acceptance Criteria

- Section 5.4.2 defines levels 0 through 5 and assigns `0x01` to 0, `0x02` to 1, `0x04` and `0x05` to 3, and `0x06` and `0x07` to 3. Protocol `0x03` has no PQ level.
- SECURITY.md and the repository README use those integers.
- No assigned protocol is given a second, conflicting level.

### REQ-protocol-4

PROTOCOL.md section 5.8 SHALL specify group membership as protocol `0x06`, a group message as protocol `0x07`, and room administration as protocol `0x03`. A legacy `0x06` note SHALL use the 78-byte hybrid header with the protocol byte set to `0x06`, SHALL be sealed under an established hybrid session key, and SHALL carry a 101-byte plaintext of action, epoch, group id, mailbox public key, and group key. Action 5 SHALL carry a 133-byte plaintext that appends the administration transaction id. A `0x07` note SHALL be a payment to the mailbox with a 54-byte header of version, protocol, group id, epoch, per-sender counter, and nonce, and SHALL derive its message key with HKDF-SHA256 info `AlgoChat-group-v1`. The group key wrap SHALL be PQ level 3. An everyday `0x01` wrap SHALL NOT deliver a group key. Section 5.8.4 SHALL remain the historical membership run.

#### Acceptance Criteria

- Section 5.8 states both headers, the 101-byte legacy plaintext, and the 133-byte action 5 plaintext.
- The identifier table lists `0x03`, `0x06`, and `0x07`, and says tag v1.3.0 does not include them.
- Section 5.8.4 names rounds 46313 through 46322 and stays a historical membership record.

### REQ-protocol-5

Each library SHALL seal and open protocol `0x06` and protocol `0x07` as section 5.8 specifies. vectors/group-v1.json SHALL be the shared membership note, message key, and message note. A repeated sender, epoch, and counter SHALL be rejected. On LocalNet, the libraries SHALL create a group of three, add a fourth member, remove one member, and post one `0x07` note to that mailbox. Every library SHALL open that note. Opening it with the removed member's previous group key SHALL fail.

#### Acceptance Criteria

- All six libraries match vectors/group-v1.json.
- A repeated counter is rejected in each library.
- The LocalNet script records one mailbox, one posted message, six successful opens, and a failed open with the previous group key.

### REQ-protocol-6

Each library SHALL reduce protocol `0x03` and seal protocol `0x06` action 5 as section 5.8 and `vectors/group-admin-v1.json` specify. A client SHALL accept an administration record only when the parent state authorized that sender. A join request SHALL NOT advance the room head. Adding a member SHALL NOT rotate the room key. Removal, rekey, and ownership transfer SHALL rotate it. The mailbox spending key SHALL NOT be treated as ownership. A legacy `group-v1` note SHALL still open and SHALL NOT create an owner.

Acceptance Criteria
- All six libraries match `vectors/group-admin-v1.json`, including rejected reasons.
- A non-admin record is rejected, a transfer to a non-member is rejected, and a replay is rejected.
- Removal withholds the new key from the removed member. An old message still opens. A new message fails under the old key.
- `vectors/group-v1.json` is unchanged.
- ts/src/pq/group-admin.test.ts, go/group_admin_test.go, py/tests/test_group_admin.py, rs/src/group_admin.rs, kt/src/test/kotlin/com/corvidlabs/algochat/GroupAdminTest.kt, and swift/Tests/AlgoChatTests/GroupAdminTests.swift name REQ-protocol-6.

