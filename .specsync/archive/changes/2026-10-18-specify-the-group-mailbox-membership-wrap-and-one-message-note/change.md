---
id: specify-the-group-mailbox-membership-wrap-and-one-message-note
state: archived
type: feature
base_commit: 237a97488ac663fdf326e07badc383b4452db4ad
---

# Specify the group mailbox, membership wrap, and one message note

## Intent

Specify the group mailbox, membership wrap, and one message note

## Affected Canonical Specs

- `protocol`

## Acceptance Criteria

- PROTOCOL.md section 5.8 specifies 0x06 and 0x07. A 0x06 note uses the 78-byte hybrid header and carries a 101-byte membership record on an established hybrid session. A 0x07 note is 54 bytes of header plus ciphertext, paid to the mailbox. The group key wrap is PQ level 3. Everyday 0x01 is not a legal wrap. Parity is not claimed until the six-library LocalNet run in section 5.8.4.

## No-spec Rationale

Not applicable
