---
id: describe-the-repository-and-run-each-library-ci-only-when-that-library-changes
state: approved
type: documentation
base_commit: 305a6cb3b5b33caaff207594be76013880557289
---

# Describe the repository and run each library CI only when that library changes

## Intent

Describe the repository and run each library CI only when that library changes

## Affected Canonical Specs

- None

## Acceptance Criteria

- The README names the six libraries and links the protocol docs. CI runs a language suite only when that language or its workflow changes. The daily status job reads this repository, not the old split repositories.

## No-spec Rationale

The wire format is unchanged. This updates the README and path filters on CI.
