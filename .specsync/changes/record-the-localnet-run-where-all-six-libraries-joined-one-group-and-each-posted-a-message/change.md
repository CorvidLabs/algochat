---
id: record-the-localnet-run-where-all-six-libraries-joined-one-group-and-each-posted-a-message
state: implementing
type: documentation
base_commit: 13f1255ea268ca3fe9318e08a000900d7c554d5a
---

# Record the LocalNet run where all six libraries joined one group and each posted a message

## Intent

Record the LocalNet run where all six libraries joined one group and each posted a message

## Affected Canonical Specs

- None

## Acceptance Criteria

- ts/scripts/group-talk-localnet.ts is in the tree. PROTOCOL.md section 5.8.4 and PARITY.md name mailbox round 46375, membership rounds 46376 through 46380, and message rounds 46381 through 46386. Each library posted its own line and every library opened every line. The record says TypeScript created the handshakes and the other five accepted them.

## No-spec Rationale

The wire and REQ-protocol-4 and REQ-protocol-5 stay as recorded. This adds the six-speaker LocalNet transcript to section 5.8.4 and checks in that driver.
