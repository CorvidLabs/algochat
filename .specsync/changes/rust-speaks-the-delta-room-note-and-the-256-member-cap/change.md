---
id: rust-speaks-the-delta-room-note-and-the-256-member-cap
state: implementing
type: feature
base_commit: eab9653b1c23ef9cb0d55a3e1fed58d0a5f9a8a9
---

# Rust speaks the delta room note and the 256 member cap

## Intent

Rust speaks the delta room note and the 256 member cap

## Affected Canonical Specs

- None

## Acceptance Criteria

- Rust drafts and reduces the same delta room note as TypeScript. A full-list note of 256 members is rejected. A delta note folds through 256. Old full-list notes still open. A channel keeps its own roster. A missed key payment can be resumed.

## No-spec Rationale

The protocol spec and the frozen vectors already record the delta room note, the 256 member cap, and the channel parent id. This change is the rust implementation and the rust module notes. It does not change a canonical spec.
