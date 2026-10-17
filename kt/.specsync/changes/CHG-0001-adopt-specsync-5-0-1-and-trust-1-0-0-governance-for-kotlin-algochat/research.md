---
change: CHG-0001-adopt-specsync-5-0-1-and-trust-1-0-0-governance-for-kotlin-algochat
artifact: research
---

# Research

The existing hosted workflow runs the Gradle build and tests across JDK 17 and 21 and uploads test reports. The repository's existing Fledge lint task references a missing `ktlintCheck` Gradle task, so it is a pre-existing unusable lane rather than a valid blocking check. The migration composes the working native test, build, and JAR tasks and leaves that unrelated configuration issue unchanged.
