---
id: room-administration-reducer-and-action-5-key-delivery
state: implementing
type: feature
base_commit: 29653c895d6728bd078e3d49dff0de09893b51b9
---

# Room administration reducer and action-5 key delivery

## Intent

Room administration reducer and action-5 key delivery

## Affected Canonical Specs

- `algochat`

## Acceptance Criteria

- go/group_admin_test.go matches vectors/group-admin-v1.json, including rejected reasons and the 227-byte action-5 note.

## No-spec Rationale

The module spec already names the room administration exports and source file.
