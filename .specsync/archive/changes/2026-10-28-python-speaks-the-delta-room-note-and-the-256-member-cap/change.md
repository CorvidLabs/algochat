---
id: python-speaks-the-delta-room-note-and-the-256-member-cap
state: archived
type: feature
base_commit: 3124ff1e5d1bda5c7328eb29c86f7da8c0f14977
---

# Python speaks the delta room note and the 256 member cap

## Intent

Python speaks the delta room note and the 256 member cap

## Affected Canonical Specs

- None

## Acceptance Criteria

- Python drafts and reduces the same delta room note as TypeScript. A full-list note of 256 members is rejected. A delta note folds through 256. Old full-list notes still open. A channel keeps its own roster. A missed key payment can be resumed.

## No-spec Rationale

The protocol spec and the frozen vectors already record the delta room note, the 256 member cap, and the channel parent id. This change is the python implementation and the python module notes. It does not change a canonical spec.
