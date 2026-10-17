---
change: CHG-0002-run-the-existing-go-compatibility-matrix-for-governance-only-rollout-changes
artifact: testing
---

# Testing

- Run `specsync check --strict --no-cache` with the audited SpecSync PR #353 binary.
- Run `fledge trust doctor` and `fledge trust verify` locally.
- Inspect the final workflow diff to confirm only the two path lists changed.
- On the pull request, require `trust` and each existing Go 1.22, 1.23, and 1.24 matrix job to pass on the same commit.
- After merge, confirm the protected-main push schedules the same Trust and Go checks.
