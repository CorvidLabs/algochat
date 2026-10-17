---
change: CHG-0002-run-the-existing-jdk-17-and-21-ci-matrix-when-trust-and-specsync-governance-file
artifact: context
---

# Context

The initial governance migration was intentionally advisory and recorded no
canonical behavior. Kotlin AlgoChat already has a substantial tested API: a
client and storage layer, a versioned encrypted envelope protocol, a ratcheted
PSK extension, and fixtures consumed by sibling implementations. Those stable
contracts now need accurate canonical descriptions and complete production-file
coverage. The existing CI workflow also limits triggers to Kotlin source and
build files, so governance changes must be included without changing its jobs.
