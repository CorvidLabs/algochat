---
change: CHG-0002-run-the-existing-go-compatibility-matrix-for-governance-only-rollout-changes
artifact: context
---

# Context

The existing Go workflow preserves a Go 1.22 through 1.24 compatibility matrix, but its path filters only observe Go sources, module files, and the workflow itself. The accepted governance migration changed only Trust and SpecSync files, so GitHub correctly did not schedule the compatibility matrix for the current pull-request head.

The unified Trust job is green and exercises the native build, vet, and race-test lane on Go 1.25. This operational correction makes the independent compatibility matrix observe governance changes without changing its runners, versions, setup, commands, concurrency, or job structure.
