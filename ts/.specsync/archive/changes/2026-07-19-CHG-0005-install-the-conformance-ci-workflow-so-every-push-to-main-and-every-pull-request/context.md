---
change: CHG-0005-install-the-conformance-ci-workflow-so-every-push-to-main-and-every-pull-request
artifact: context
---

# Context

The conformance test-vector suite merged in #32 ships 79 protocol vectors plus a CI template, installed on this branch as `.github/workflows/conformance.yml`. The first installation attempt rode under CHG-0004, whose deliverable did not land before its squash merge orphaned its verification commit; CHG-0004 was archived in #38 and this change completes the installation with verification recorded against a commit that remains in branch history. The workflow has already executed green on this pull request (unit tests, 79 checks, determinism guard).
