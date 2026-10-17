---
change: CHG-0001-adopt-specsync-5-0-1-and-trust-1-0-0-governance-for-kotlin-algochat
artifact: design
---

# Design

Adopt SpecSync 5.0.1 with an explicit governance-only no-spec-change rationale and all four agent integrations. Add a `verify` lane using Gradle test, build, and JAR packaging. Trust 1.0.0 runs it on JDK 17 with blocking risk, progressive provenance, advisory contract coverage, and Atlas disabled. Preserve the independent JDK matrix and release publication workflow.
