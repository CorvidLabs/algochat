---
id: swift-speaks-the-delta-room-note-and-the-256-member-cap
state: archived
type: feature
base_commit: d95c89887c2f5129371d642ae9bf05cc5c724555
---

# Swift speaks the delta room note and the 256 member cap

## Intent

Swift speaks the delta room note and the 256 member cap

## Affected Canonical Specs

- None

## Acceptance Criteria

- Swift drafts and reduces the same delta room note as TypeScript. A full-list note of 256 members is rejected. A delta note folds through 256. Old full-list notes still open. A channel keeps its own roster. A missed key payment can be resumed.

## No-spec Rationale

The protocol spec and the frozen vectors already record the delta room note, the 256 member cap, and the channel parent id. This change is the swift implementation and the swift module notes. It does not change a canonical spec.
