---
id: room-administration-reducer-and-action-5-key-delivery
state: archived
type: feature
base_commit: d71341d1cc6e2f43fd49ddb47d902a0741048d11
---

# Room administration reducer and action-5 key delivery

## Intent

Room administration reducer and action-5 key delivery

## Affected Canonical Specs

- `algochat`

## Acceptance Criteria

- ts/src/pq/group-admin.test.ts matches vectors/group-admin-v1.json, including rejected reasons, delivery authorization, and the 227-byte action-5 note. Legacy group tests still open vectors/group-v1.json.

## No-spec Rationale

Not applicable
