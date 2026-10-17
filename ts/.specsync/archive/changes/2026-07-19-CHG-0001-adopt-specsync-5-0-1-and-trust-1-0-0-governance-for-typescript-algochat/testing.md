---
change: CHG-0001-adopt-specsync-5-0-1-and-trust-1-0-0-governance-for-typescript-algochat
artifact: testing
---

# Testing

Run `specsync check --strict --force` at threshold 0, `specsync agents status`, `fledge trust doctor`, and `fledge lanes run verify`. The lane must type-check/build the package and pass all 454 Bun tests. Publishing remains gated by the existing version check.
