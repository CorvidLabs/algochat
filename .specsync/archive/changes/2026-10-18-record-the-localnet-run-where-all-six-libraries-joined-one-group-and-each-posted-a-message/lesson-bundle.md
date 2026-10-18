# Lesson bundle: record-the-localnet-run-where-all-six-libraries-joined-one-group-and-each-posted-a-message

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Record the LocalNet run where all six libraries joined one group and each posted a message
- **Kind**: Documentation
- **Paths**: PROTOCOL.md, PARITY.md, README.md, ts
- **Acceptance**: ts/scripts/group-talk-localnet.ts is in the tree. PROTOCOL.md section 5.8.4 and PARITY.md name mailbox round 46375, membership rounds 46376 through 46380, and message rounds 46381 through 46386. Each library posted its own line and every library opened every line. The record says TypeScript created the handshakes and the other five accepted them.

## Evidence

- Verification commit: `75b7c6c6368a1bc7270f861a5b1e5026953ea3bb`
- Base commit: `13f1255ea268ca3fe9318e08a000900d7c554d5a`
- Verified by: `specsync check --spec protocol`

## From the change's context.md

# Context

The first LocalNet record posted one shared message. A later run on the same chain put TypeScript, Go, Rust, Python, Kotlin, and Swift in one group. Each library accepted its membership note and posted its own line. Every library opened every line. That transcript was not in the pull request. This change checks in the driver and names the rounds. The wire does not change. Identifier 0x03 stays unassigned. Tag v1.3.0 stays as it is.

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
