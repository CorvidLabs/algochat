# Lesson bundle: list-chough-0-6-0-record-folders-in-verification-ignored-paths

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: List Chough 0.6.0 record folders in verification_ignored_paths
- **Kind**: Operations
- **Paths**: .specsync/sdd.json
- **Acceptance**: .specsync/sdd.json verification_ignored_paths lists .chough/sessions/, .chough/archive/ and .chough/bugs/; chough doctor reports no records_in_verification finding; specsync check passes

## Evidence

- Verification commit: `7c0dd52460f30ae15657ab21990ccbcf0f9d3b19`
- Base commit: `c7ddd23d7c96d66aea4ca5e325f2389dd1da6bab`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

Chough 0.6.0 adoption in algochat (2026-11-12). After `chough migrate`, `chough doctor`
and the migration receipt report `records_in_verification`: `.specsync/sdd.json` has no
`verification_ignored_paths` entry for Chough's record folders, so a Chough record
written after `specsync change check --commit` would stale the recorded verification.
Chough never writes this policy itself; its docs say adding the entries is an ordinary
reviewed change to `.specsync/sdd.json`. Leif's adoption instructions name this
follow-up as a small SpecSync change. `.specsync/sdd.json` is a meaningful path here,
so the edit needs its own native lifecycle.

## From the change's testing.md

# Testing

- `specsync check` passes with the edited policy.
- `chough doctor` reports no `records_in_verification` finding.

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
