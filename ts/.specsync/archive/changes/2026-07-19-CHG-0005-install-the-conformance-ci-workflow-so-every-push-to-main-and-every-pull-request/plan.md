---
change: CHG-0005-install-the-conformance-ci-workflow-so-every-push-to-main-and-every-pull-request
artifact: plan
---

# Plan

1. Keep the workflow file at `.github/workflows/conformance.yml` on this branch.
2. Verify the native Fledge lane stays green (type-check, build, 454 Bun tests).
3. Confirm the conformance workflow runs green on this pull request.
4. Confirm the Trust contract gate passes with the workflow path covered by this change.
5. Archive this change after integration.
