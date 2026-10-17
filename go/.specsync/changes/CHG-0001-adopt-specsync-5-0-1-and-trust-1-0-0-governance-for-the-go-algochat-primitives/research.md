---
change: CHG-0001-adopt-specsync-5-0-1-and-trust-1-0-0-governance-for-the-go-algochat-primitives
artifact: research
---

# Research

Existing CI builds, vets, and race-tests the package across a compatibility matrix. The Go module currently declares Go 1.25 while the preserved workflow lists earlier versions, so hosted compatibility behavior remains independent evidence. Two source files are not gofmt-clean, but formatting was not an existing required check and is not absorbed into this governance-only migration. No prior SpecSync threshold exists.
