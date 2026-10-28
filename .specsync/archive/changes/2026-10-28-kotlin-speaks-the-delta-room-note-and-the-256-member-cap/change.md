---
id: kotlin-speaks-the-delta-room-note-and-the-256-member-cap
state: archived
type: feature
base_commit: 08a848937593d485b52e82726ddc4de7cdcf3138
---

# Kotlin speaks the delta room note and the 256 member cap

## Intent

Kotlin speaks the delta room note and the 256 member cap

## Affected Canonical Specs

- None

## Acceptance Criteria

- Kotlin drafts and reduces the same delta room note as TypeScript. A full-list note of 256 members is rejected. A delta note folds through 256. Old full-list notes still open. A channel keeps its own roster. A missed key payment can be resumed.

## No-spec Rationale

The protocol spec and the frozen vectors already record the delta room note, the 256 member cap, and the channel parent id. This change is the kotlin implementation and the kotlin module notes. It does not change a canonical spec.
