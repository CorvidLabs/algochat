---
change: CHG-0005-install-the-conformance-ci-workflow-so-every-push-to-main-and-every-pull-request
artifact: tasks
---

# Tasks

- [x] Land the workflow file at `.github/workflows/conformance.yml` on this branch.
- [x] Observe the conformance workflow run green on this pull request (unit tests, 79 checks, determinism guard).
- [x] Pass the native Fledge verification lane (type-check, build, 454 Bun tests).
- [x] Record verification against a commit that remains in branch history.
