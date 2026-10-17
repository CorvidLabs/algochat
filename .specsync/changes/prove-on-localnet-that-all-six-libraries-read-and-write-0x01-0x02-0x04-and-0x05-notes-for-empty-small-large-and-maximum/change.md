---
id: prove-on-localnet-that-all-six-libraries-read-and-write-0x01-0x02-0x04-and-0x05-notes-for-empty-small-large-and-maximum
state: approved
type: feature
base_commit: 76dcba487d1c83c233f2915f86ca15eba418137b
---

# Prove on LocalNet that all six libraries read and write 0x01, 0x02, 0x04, and 0x05 notes for empty, small, large, and maximum plaintext, including several messages in one exchange. Go gains Extra lock. Every library accepts version 0x02 header binding the way TypeScript emits it. Identifier 0x03 stays unassigned.

## Intent

Prove on LocalNet that all six libraries read and write 0x01, 0x02, 0x04, and 0x05 notes for empty, small, large, and maximum plaintext, including several messages in one exchange. Go gains Extra lock. Every library accepts version 0x02 header binding the way TypeScript emits it. Identifier 0x03 stays unassigned.

## Affected Canonical Specs

- `protocol`

## Acceptance Criteria

- On LocalNet, each library writes 0x01, 0x02, 0x04, and 0x05 notes for empty, small, large, and maximum plaintext, plus several messages in one exchange. Every other library opens those confirmed notes. Version 0x02 header binding matches TypeScript. Go implements Extra lock. Identifier 0x03 is not used.

## No-spec Rationale

Not applicable
