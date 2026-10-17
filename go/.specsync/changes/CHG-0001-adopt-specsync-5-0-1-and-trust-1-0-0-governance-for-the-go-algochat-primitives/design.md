---
change: CHG-0001-adopt-specsync-5-0-1-and-trust-1-0-0-governance-for-the-go-algochat-primitives
artifact: design
---

# Design

Keep the existing Go workflow unchanged. Add a separate job named `trust` on Go 1.25, pinned to immutable Trust 1.0.0, and delegate build, vet, and race tests to Fledge. Use advisory contract coverage zero with the no-prior-threshold rationale, blocking risk, progressive provenance, and Atlas disabled.
