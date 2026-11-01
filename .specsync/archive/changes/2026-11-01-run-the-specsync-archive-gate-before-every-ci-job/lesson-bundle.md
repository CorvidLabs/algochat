# Lesson bundle — run-the-specsync-archive-gate-before-every-ci-job

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Run the SpecSync archive gate before every CI job
- **Kind**: Operations
- **Paths**: .github/workflows/go.yml, .github/workflows/hi.yml, .github/workflows/kt.yml, .github/workflows/protocol.yml, .github/workflows/py.yml, .github/workflows/release-qualification.yml, .github/workflows/rs.yml, .github/workflows/spec-sync.yml, .github/workflows/status-renderer.yml, .github/workflows/swift.yml, .github/workflows/trust.yml, .github/workflows/ts.yml, .github/workflows/workflow-safety.yml
- **Acceptance**: Every pull_request/push workflow (go, hi, kt, protocol, py, release-qualification, rs, spec-sync, status-renderer, swift, trust, ts, workflow-safety) starts with an archive-gate job named Archive that runs CorvidLabs/spec-sync pinned to 106aaa43d0bcf049f19b173ddb63815a25c3f931 with archive-gate-only: 'true'; every other job needs it directly or transitively (release-qualification complete also lists it and fails unless it succeeded), so an open change under .specsync/changes/ fails Archive and nothing else runs; scripts/release workflow tests still pass.

## Evidence

- Verification commit: `c386493deb0b3e42e1bde7aa58a9c84f6771645f`
- Base commit: `fae3900f9729724c088bdbe67faf2d8a69655dec`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

This is part of the org-wide rollout of CorvidLabs/spec-sync#832 (merged as
106aaa43d0bcf049f19b173ddb63815a25c3f931), approved by 0xLeif. That pull request
added an archive gate to the spec-sync GitHub Action: with
`archive-gate-only: 'true'` it runs only `.github/scripts/archive-readiness.sh`
(bash and python3, no binary download) and fails while any change under
`.specsync/changes/` is still open. The goal is that every SpecSync change is
archived before a pull request merges, and that CI runs nothing else until it is.

Published spec-sync releases up to and including v6.1.1 ignore the new input, so
the step pins the merge commit instead of a tag. Branch protection, through an
org ruleset that requires a check named `Archive`, is configured separately and
is not part of this repository change.

Workflows skipped because they never run on pull_request, push or merge_group:
`publish-npm.yml` (workflow_dispatch only) and `status.yml` (schedule and
workflow_dispatch only).

## From the change's design.md

# Design

Each pull_request/push workflow gains a first job, `archive-gate`, displayed as
`Archive`. It runs on `ubuntu-latest` (no workflow here runs only on self-hosted
runners), checks out the candidate commit with the same `actions/checkout` pin
the workflow already uses and `persist-credentials: false`, then runs
`CorvidLabs/spec-sync@106aaa43d0bcf049f19b173ddb63815a25c3f931` with
`archive-gate-only: 'true'`.

Every job that had no `needs` now has `needs: archive-gate`. Jobs that already
had `needs` reach the gate transitively (`trust.yml` `deploy-atlas` through
`trust`). In `release-qualification.yml` the `complete` aggregate job runs with
`if: always()`, so it also lists `archive-gate` in its `needs`; its existing
"Reject failed or skipped jobs" step asserts that every need succeeded, so it
fails whenever the gate did not pass.

The lane workflows (ts, py, rs, kt, go, swift) are also reusable workflows
called by `release-qualification.yml`. They keep their own gate, so a direct run
is gated too; in the matrix the caller's jobs already need the caller's gate.
The comments added contain none of the words `check_workflow` in
`scripts/release/test_release.py` rejects, and the job uses the indentation its
small workflow parser accepts.

## From the change's testing.md

# Testing

- Each edited workflow parses with Ruby Psych (`Psych.safe_load`), and the
  printed job graph shows `archive-gate` with no `needs`, every other job
  needing it (or reaching it through `trust`), and `complete` listing it.
- `python3 -m unittest discover -s scripts/release` passes (25 tests), which
  covers the repository's own workflow parser, permission and
  `persist-credentials` rules, and the lane-trigger graph.
- spec-sync's `.github/scripts/archive-readiness.sh`, the script the pinned
  action runs, against this checkout: it fails while this change is open, as
  intended, and passes once the change is archived.
- `specsync change audit --strict` and `specsync check --strict` with specsync
  6.1.1, the version CI pins.
- On the pull request, the `Archive` check must run first in each triggered
  workflow and every other job must wait for it.

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
