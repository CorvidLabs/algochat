---
id: go-speaks-the-delta-room-note-and-the-256-member-cap
state: archived
type: feature
base_commit: 2ed2718d632cbaee654ef7c86fd975e510606b8c
---

# Go speaks the delta room note and the 256 member cap

## Intent

Go speaks the delta room note and the 256 member cap

## Affected Canonical Specs

- None

## Acceptance Criteria

- Go drafts and reduces the same delta room note as TypeScript. A full-list note of 256 members is rejected. A delta note folds through 256. Old full-list notes still open. A channel keeps its own roster. A missed key payment can be resumed.

## No-spec Rationale

The protocol spec and the frozen vectors already record the delta room note, the 256 member cap, and the channel parent id. This change is the Go implementation and the Go module notes. It does not change a canonical spec.
