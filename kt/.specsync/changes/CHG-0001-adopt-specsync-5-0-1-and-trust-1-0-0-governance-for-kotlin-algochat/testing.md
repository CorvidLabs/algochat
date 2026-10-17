---
change: CHG-0001-adopt-specsync-5-0-1-and-trust-1-0-0-governance-for-kotlin-algochat
artifact: testing
---

# Testing

Run `specsync check --strict --force` at advisory threshold 0, `specsync agents status`, `fledge trust doctor`, and `fledge lanes run verify`. The native lane must pass the Kotlin tests, Gradle build, and JAR task. Hosted CI must retain and pass both JDK 17 and JDK 21 jobs and continue uploading their test reports.
