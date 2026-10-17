---
change: CHG-0004-install-the-conformance-ci-workflow-delivered-with-the-test-vector-suite-so-ever
artifact: plan
---

# Plan

1. Copy `conformance/ci/conformance.yml` verbatim to `.github/workflows/conformance.yml`.
2. Open the pull request and confirm the workflow triggers on it.
3. Confirm all three workflow steps pass: unit tests, 79-check verification, determinism guard.
4. Confirm the Trust contract gate passes with the workflow path covered by this change.
5. Validate with SpecSync 5.0.1 and Trust 1.0.0.
