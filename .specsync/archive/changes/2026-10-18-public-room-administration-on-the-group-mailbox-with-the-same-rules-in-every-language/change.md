---
id: public-room-administration-on-the-group-mailbox-with-the-same-rules-in-every-language
state: archived
type: feature
base_commit: d71341d1cc6e2f43fd49ddb47d902a0741048d11
---

# Public room administration on the group mailbox, with the same rules in every language

## Intent

Public room administration on the group mailbox, with the same rules in every language

## Affected Canonical Specs

- `protocol`

## Acceptance Criteria

- Every library reduces vectors/group-admin-v1.json to the same accepted and rejected room states, seals the same 227-byte action-5 delivery, and still opens vectors/group-v1.json. A LocalNet invite-only room and an ask-to-join room each post one 0x07 payment. Tag v1.3.0 still does not include 0x03, 0x06, or 0x07.

## No-spec Rationale

Not applicable
