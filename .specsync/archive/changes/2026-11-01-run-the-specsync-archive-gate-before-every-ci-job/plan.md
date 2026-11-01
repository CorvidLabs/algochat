---
change: run-the-specsync-archive-gate-before-every-ci-job
artifact: plan
---

# Plan

## Approach

Add an `archive-gate` job named `Archive` at the top of `jobs:` in every
workflow that triggers on pull_request or push, and make every other job depend
on it, directly or transitively. Leave all other workflow content unchanged.

## Out of scope

Workflows that do not run on pull_request or push (`publish-npm.yml`,
`status.yml`); the org ruleset that requires the `Archive` check; moving the
spec-sync pin to a release tag, which waits for the first release that ships
the archive gate; the existing `spec-sync` job and its v6.1.1 pin.

## Steps

1. Insert the `archive-gate` job, reusing each workflow's existing
   `actions/checkout` pin.
2. Add `needs: archive-gate` to every job without `needs`, and add
   `archive-gate` to the `needs` list of the `complete` aggregate job in
   `release-qualification.yml`.
3. Parse each edited workflow, print each job's `needs`, and run the
   repository's workflow tests in `scripts/release`.
4. Run the archive-readiness script and `specsync change audit --strict` /
   `specsync check --strict` locally.

## Risks

A skipped job counts as passing for GitHub, so merge blocking relies on the org
ruleset requiring the `Archive` check rather than on downstream jobs. The pinned
commit must be moved to a release tag once one ships the archive gate. Every
gated workflow now waits for one short extra job before its real work starts.

## Constraints consulted

AGENTS.md: kept the CorvidLabs trust toolchain gate in place and did not weaken
it (`trust.yml` still runs, now after Archive); module specs need no update
because no spec owns `.github/workflows`; no Human intent (`hi/`) entry was
added because this is CI ordering, not a feature somebody asked for in their own
words. `scripts/release/test_release.py` workflow rules (read-only permissions,
no publication words, `persist-credentials: false`) were honored.
