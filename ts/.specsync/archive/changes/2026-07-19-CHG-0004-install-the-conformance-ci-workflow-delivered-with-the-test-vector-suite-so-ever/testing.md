---
change: CHG-0004-install-the-conformance-ci-workflow-delivered-with-the-test-vector-suite-so-ever
artifact: testing
---

# Testing

Run `bun run tsc` and `bun test` through the existing Fledge verification lane; the change adds no product code, so native verification must stay green. The installed workflow is itself the functional evidence: on this change's pull request it must execute `bun test`, `bun conformance/tools/verify.mjs` (79 checks), and the deterministic regeneration comparison for sections 00, 01, 03, and 05, all passing. The installed file is compared byte-for-byte against `conformance/ci/conformance.yml`.
