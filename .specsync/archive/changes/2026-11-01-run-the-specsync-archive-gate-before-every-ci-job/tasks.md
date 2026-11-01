---
change: run-the-specsync-archive-gate-before-every-ci-job
artifact: tasks
---

# Tasks

- [x] Add the `archive-gate` job (`name: Archive`) to go, hi, kt, protocol, py,
  release-qualification, rs, spec-sync, status-renderer, swift, trust, ts and
  workflow-safety workflows.
- [x] Make every other job need `archive-gate`, directly or transitively.
- [x] Add `archive-gate` to the `complete` aggregate job's `needs` in
  `release-qualification.yml`.
- [x] Verify the workflows parse and the job graph is as intended.
- [x] Run the repository's workflow tests and the archive-readiness script.
