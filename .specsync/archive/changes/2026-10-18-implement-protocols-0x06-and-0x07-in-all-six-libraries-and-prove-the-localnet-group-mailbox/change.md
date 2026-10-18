---
id: implement-protocols-0x06-and-0x07-in-all-six-libraries-and-prove-the-localnet-group-mailbox
state: archived
type: feature
base_commit: 5902ad01b3a645bda92b47434f65425504e04d33
---

# Implement protocols 0x06 and 0x07 in all six libraries and prove the LocalNet group mailbox

## Intent

Implement protocols 0x06 and 0x07 in all six libraries and prove the LocalNet group mailbox

## Affected Canonical Specs

- `protocol`

## Acceptance Criteria

- TypeScript, Go, Rust, Python, Kotlin, and Swift seal and open the same 0x06 and 0x07 notes from vectors/group-v1.json. A LocalNet run creates a group of three, adds a fourth, removes one, and posts one 0x07 payment to that group's mailbox. Every library opens that message. Opening it with the removed member's previous group key fails. A repeated sender, epoch, and counter fails. PROTOCOL.md section 5.8.4, TEST-VECTORS.md, and PARITY.md record the bytes and the run. Identifier 0x03 stays unassigned.

## No-spec Rationale

Not applicable
