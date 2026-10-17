---
change: CHG-0002-run-the-existing-go-compatibility-matrix-for-governance-only-rollout-changes
artifact: plan
---

# Plan

1. Add `.github/workflows/trust.yml`, `.specsync/**`, `.trust.toml`, and `fledge.toml` to both the pull-request and protected-main push path lists in `.github/workflows/go.yml`.
2. Preserve the workflow matrix, jobs, runners, Go setup, build, vet, race tests, concurrency, and existing path entries exactly.
3. Validate the workflow diff locally, run strict SpecSync and the native Trust lane, then publish the approved correction.
4. Require the hosted Trust check and all three existing Go matrix jobs to pass on the same pull-request head.
