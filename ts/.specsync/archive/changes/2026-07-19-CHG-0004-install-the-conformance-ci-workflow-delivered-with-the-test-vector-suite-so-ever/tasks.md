---
change: CHG-0004-install-the-conformance-ci-workflow-delivered-with-the-test-vector-suite-so-ever
artifact: tasks
---

# Tasks

- [x] Stage the merged template byte-identically for installation at `.github/workflows/conformance.yml` (the file lands by maintainer push because the automation token lacks the workflows permission).
- [x] Pass the native Fledge verification lane (type-check, build, 454 Bun tests).
- [x] Document that the workflow's green pull-request run is the functional completion evidence.
- [x] Document the post-integration archiving step for this change.
