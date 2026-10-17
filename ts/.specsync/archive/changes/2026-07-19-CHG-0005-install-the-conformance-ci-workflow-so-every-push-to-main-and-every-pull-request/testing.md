---
change: CHG-0005-install-the-conformance-ci-workflow-so-every-push-to-main-and-every-pull-request
artifact: testing
---

# Testing

Run `bun run tsc` and `bun test` through the existing Fledge verification lane; the change adds no product code, so native verification must stay green. The installed workflow is itself the functional evidence: on this pull request it executes `bun test`, `bun conformance/tools/verify.mjs` (79 checks), and the deterministic regeneration comparison for sections 00, 01, 03, and 05 — all observed passing.
