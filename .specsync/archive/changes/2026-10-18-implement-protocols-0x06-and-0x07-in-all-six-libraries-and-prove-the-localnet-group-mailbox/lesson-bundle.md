# Lesson bundle — implement-protocols-0x06-and-0x07-in-all-six-libraries-and-prove-the-localnet-group-mailbox

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Implement protocols 0x06 and 0x07 in all six libraries and prove the LocalNet group mailbox
- **Kind**: Feature
- **Specs**: protocol
- **Paths**: ts, go, rs, py, kt, swift, scripts, PROTOCOL.md, TEST-VECTORS.md, PARITY.md, README.md, SECURITY.md, implementations.json, vectors, docs, hi
- **Acceptance**: TypeScript, Go, Rust, Python, Kotlin, and Swift seal and open the same 0x06 and 0x07 notes from vectors/group-v1.json. A LocalNet run creates a group of three, adds a fourth, removes one, and posts one 0x07 payment to that group's mailbox. Every library opens that message. Opening it with the removed member's previous group key fails. A repeated sender, epoch, and counter fails. PROTOCOL.md section 5.8.4, TEST-VECTORS.md, and PARITY.md record the bytes and the run. Identifier 0x03 stays unassigned.

## Evidence

- Verification commit: `8581279ec9dd1037e3db94cd6ae5fc468579bc15`
- Base commit: `5902ad01b3a645bda92b47434f65425504e04d33`
- Verified by: `specsync check --spec protocol --spec release`

## From the change's context.md

# Context

Section 5.8 already freezes protocols 0x06 and 0x07. No library writes them yet, and parity is not claimed. Raven still fans a group out as separate 1:1 notes. This change is the library and LocalNet follow-through, in the feat/group-mailbox worktree, so it does not touch the checkout on test/local-parity-evidence.

The wrap stays the hybrid session from 0x04. There is one membership layout. Identifier 0x03 stays unassigned. A group whose members have no hybrid keys is not in this change.

## From the change's design.md

# Design

A 0x06 note is 195 bytes: the 78-byte hybrid header with protocol byte 0x06, a 101-byte plaintext, and a 16-byte tag. Associated data is the header. The key is the hybrid session key. The plaintext is action, epoch as a big-endian u32, group id, mailbox public key, and group key.

A 0x07 note starts with 54 bytes: version 0x02, protocol 0x07, group id, epoch, counter, nonce. Associated data is that header. The message key is HKDF-SHA256. Salt is epoch concatenated with counter. Input keying material is the group key. Info is the UTF-8 label AlgoChat-group-v1, the group id, and the 32-byte sender address taken from the payment, not from the note.

Open rejects a counter the caller already accepted for that sender and epoch. A removed member is not given the new group key, so opening the new 0x07 with the previous key fails authentication. The mailbox is funded once with 100000 microAlgos. Later notes are 0-microAlgo payments. The creator's 0x06 payments are 1:1 payments to each member.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| REQ-protocol-4 | PROTOCOL.md section 5.8 states both headers and the 101-byte plaintext. The identifier table marks 0x06 and 0x07 implemented and says tag v1.3.0 does not include them. Section 5.8.4 names rounds 46313 through 46322 and says the previous group key failed. |
| REQ-protocol-5 | vectors/group-v1.json matches in TypeScript, Go, Rust, Python, Kotlin, and Swift. ts/scripts/group-matrix-localnet.ts funded the mailbox in round 46313, posted one 0x07 in round 46322, and every library opened it. The previous group key failed in all six. A repeated counter failed in all six. |

Each library loads vectors/group-v1.json and checks the membership note, the message key, and the message note. A repeated counter is rejected. bun scripts/validate.ts remains the SpecSync verification command.

## Where these lessons go

- `specs/protocol/context.md`
