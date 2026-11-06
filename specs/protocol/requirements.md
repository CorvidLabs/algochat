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
- The identifier table lists `0x03`, `0x06`, and `0x07`, says tag v1.4.0 includes them, and says tag v1.3.0 does not.
- Version history names 1.5.0 as the delta room note: member count 65535, 256 people, and channels the group owner keeps.
- Version history names 1.6.0 as room bots, `0x03` ops 13 and 14, listed after 1.5.0.
- Section 5.8.4 names rounds 46313 through 46322 and stays a historical membership record.
- Document the existing wire offsets, AAD and key derivations for protocols `0x03` through `0x07`, with source-grounded diagrams and explicit application responsibilities for authorization and replay tracking.
- Distinguish merged implementation behavior, normative requirements, historical reported evidence and released-version boundaries; validate documentation and obtain independent review.

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

### REQ-protocol-7

PROTOCOL.md section 5.4.3 SHALL name hybrid `0x04` and `0x05` as the base for a new conversation. A room SHALL use that same hybrid session for `0x06` and `0x07`. Everyday `0x01` SHALL stay assigned for a message that does not need post-quantum protection. Extra lock `0x02` SHALL stay assigned and SHALL NOT be the default. This version SHALL NOT define a mode that stacks extra lock on a hybrid session, and SHALL NOT claim PQ level 2, 4, or 5 for a message protocol.

#### Acceptance Criteria

- Section 5.4.3 says a new conversation should start with `0x04` and `0x05`.
- Section 5.4.3 says a room uses that session for `0x06` and `0x07`.
- Section 5.4.3 keeps `0x01` and `0x02` assigned and says extra lock is not the default.
- Section 5.4.3 says this version does not stack extra lock on hybrid.

### REQ-protocol-8

TypeScript SHALL draft delta `0x03` notes that omit the member list, SHALL still reduce full-list notes from `vectors/group-admin-v1.json`, and SHALL accept 256 members. A full-list note of 256 members SHALL be rejected as too large. A channel SHALL be a separate room whose notes name the parent room's group id. The group owner creates and owns the channel. Membership in the parent SHALL NOT by itself add a member to the channel. Key deliveries SHALL be separate payments, at most 16 at a time, and a landed payment SHALL be kept so a missed recipient can be resumed. Other ports MUST NOT emit a different delta layout.

Acceptance Criteria
- `ts/src/pq/group-admin.test.ts` rejects a 256-member full list as too large and folds a delta room from 1 member through 256.
- `ts/src/pq/group-admin.test.ts` matches `vectors/group-admin-delta-v1.json` and still reduces `vectors/group-admin-v1.json`.
- A channel note points at the parent group id, and a parent member who was not added is absent from the channel.
- `vectors/group-admin-v1.json` bytes are unchanged.

### REQ-protocol-9

A room's `0x03` record SHALL hold the bot mark, reply mode and rate limit for each bot. Op 13 (add bot) and op 14 (set bot) SHALL be the only ops that carry bot settings, and only as a delta note, as five bytes after the parent group id: mode (1), replies (2, big-endian), seconds (2, big-endian). Only the owner or an admin SHALL add or change a bot. An account SHALL become a bot only through an accepted op 13; nothing the account posts about itself SHALL make it a bot, and a member already in the room SHALL NOT be marked later. A bot SHALL join at once, with no request or accept, and the epoch SHALL stay. Op 13 SHALL authorize a key delivery to its subject only. A bot SHALL NOT be appointed admin and SHALL NOT receive ownership. Reply mode SHALL be 1 (mentions), 2 (every message) or 3 (commands); replies and seconds SHALL each be 1 through 65535. There SHALL be no default mode or limit; 5 replies per 60 seconds is a suggested preset only. A channel SHALL add a bot with its own op 13, only when that account is a bot in the parent room, and SHALL reject a plain add, accept or request for a parent-room bot. TypeScript, Go, Rust, Python, Kotlin and Swift SHALL draft, reduce and check bot records the same way, with the same rejection sentences.

#### Acceptance Criteria

- All six libraries match `vectors/group-admin-bots-v1.json`: drafts byte for byte, draft_errors with the shared sentence, reductions with the same accepted ops, rejection reasons and state, and the delivery and bot lookups.
- `ts/scripts/group-bot-localnet.ts` posts room and channel bot notes on LocalNet; every language reduces the confirmed notes to the same state, bot records and rejection reasons, and the added bot opens the room key from its own session and posts in the room.
- `vectors/group-admin-v1.json` and `vectors/group-admin-delta-v1.json` bytes are unchanged.

### REQ-protocol-10

Rust SHALL verify every section and case of the TypeScript-generated conformance vectors `ts/conformance/vectors/00-06` and the shared `vectors/*.json` files it uses, reading them from byte-identical copies in `rs/vectors/` that ship in the crate. A missing vector file, a missing or unexpected section, or an unrecognized case SHALL fail the test. No Rust test SHALL return early or skip because a fixture is absent. A case Rust cannot yet check SHALL be named in one pending list with its issue; the only pending case allowed is the 01 mnemonic chain (#73). Vectors SHALL come from the TypeScript generator or the shared vector files, never from the Rust code under test. TypeScript qualification SHALL run `bun conformance/tools/verify.mjs`.

#### Acceptance Criteria

- `rs/tests/conformance.rs` passes in `rs/` and inside the extracted `.crate`; deleting a vector file, removing a section or renaming a negative case makes it fail.
- `rs/tests/cross_impl.rs` has no sibling-directory tests and no test in `rs/` returns on a missing path.
- `qualify.py ts` runs the TypeScript vector verifier and fails when it fails.

### REQ-protocol-13

Rust SHALL read a long two-way Hybrid conversation and kept Extra lock notes that TypeScript wrote. `vectors/pq-conversation-v1.json` and `vectors/psk-kept-v1.json` SHALL be written by `ts/scripts/emit-conversation-vectors.ts` from synthetic seeds and the TypeScript library, never by the Rust code under test, with randomness from a fixed seeded stream inside that script only. The conversation file SHALL hold one `0x04` handshake each way, at least 32 `0x05` messages each way including one at the 4096-byte note ceiling, and accept, sender-recovery and decrypt cases. The kept file SHALL hold version `0x02` notes under one kept secret in both directions at counters including 0, 99, 100, 199, 200 and 4294967295, tamper and wrong-secret cases, and a receive transcript with the counter state at a restart. TypeScript and Rust SHALL check every field, note and case of both files, Rust from its copies in `rs/vectors/`: both accounts SHALL derive every session key from the note and their own seed, both sides SHALL read every message and kept note, and Rust's counter window SHALL give TypeScript's result for every step, also after its state is saved and restored. No library code, public API or wire format SHALL change.

#### Acceptance Criteria

- `cargo test --locked --test pq_conversation --test psk_kept` passes in `rs/` and inside the extracted `.crate`; both sides derive the recorded session keys and read every message and kept note.
- Every handshake, message and kept-note case and every receive step gives the same result in TypeScript and Rust, before and after the restart.
- Changing one byte of a recorded note, one recorded result or the restart state fails the Rust tests; a file that differs from the emitter's output fails the TypeScript test, whose message names the regenerate command.
- A missing vector file fails both languages with the command that restores it.

### REQ-protocol-14

Rust SHALL join a room the way TypeScript does. `vectors/room-session-v1.json` SHALL be written by `ts/scripts/emit-room-session-vector.ts` from synthetic seeds and the TypeScript library, never by the Rust code under test, with randomness from a fixed seeded stream inside that script only. It SHALL hold an owner, two members and an outsider whose addresses are their accounts' Ed25519 public keys; delta `0x03` records that create an invite-only room and add both members; a `0x04` handshake from the owner to each member and that member's 227-byte `0x06` action-5 delivery under it; `0x07` messages from the owner and both members with per-sender counters; a `0x07` note from the outsider under the room key; and delivery, authorization and message cases. TypeScript and Rust SHALL check every field and case of that file, Rust from its copy in `rs/vectors/`: the records SHALL reduce to the same room, each member SHALL recover its session from the handshake with its own seed and open its delivery, `delivery_authorized` SHALL accept each delivery against the accepted records and refuse the others, every message SHALL open with per-sender replay state and a repeated `(sender, epoch, counter)` SHALL be rejected, and the outsider's note SHALL be refused by `sender_may_post` even though it opens. No library code, public API or wire format SHALL change.

#### Acceptance Criteria

- `cargo test --locked --test room_session` passes in `rs/` and inside the extracted `.crate`; each member derives the recorded session, opens its room key and reads every message.
- Every delivery, authorization and message case gives the same result in TypeScript and Rust.
- Changing one byte of a recorded note, the room key, a recorded member or result fails the Rust test; a file that differs from the emitter's output fails the TypeScript test, whose message names the regenerate command.
- A missing vector file fails both languages with the command that restores it.

