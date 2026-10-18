---
id: let-the-swift-room-administration-tests-seal-a-note
state: archived
type: bug_fix
base_commit: 25f2ecb8115e972df7303ebbfc288cf604c73b2a
---

# Let the Swift room-administration tests seal a note

## Intent

Let the Swift room-administration tests seal a note

## Affected Canonical Specs

- None

## Acceptance Criteria

- AlgoChatTests links swift-crypto and the GroupAdmin suite seals an action-5 note.

## No-spec Rationale

AlgoChatTests seals an action-5 fixture with ChaChaPoly. Package.swift is the test-target dependency, not a module spec.
