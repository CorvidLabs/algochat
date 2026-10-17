# Lesson bundle: describe-the-repository-and-run-each-library-ci-only-when-that-library-changes

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Describe the repository and run each library CI only when that library changes
- **Kind**: Documentation
- **Paths**: README.md, .github/workflows
- **Acceptance**: The README names the six libraries and links the protocol docs. CI runs a language suite only when that language or its workflow changes. The daily status job reads this repository, not the old split repositories.

## Evidence

- Verification commit: `658c28c4866e28c720af8959ae0a377f35379b3c`
- Base commit: `305a6cb3b5b33caaff207594be76013880557289`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

The import pull request put six libraries and the protocol into one repository. The README was the old protocol page with a table pasted on top. CI ran every language on every pull request, and the daily status job still checked out the old split repositories.

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
