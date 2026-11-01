---
change: run-the-specsync-archive-gate-before-every-ci-job
artifact: design
---

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
