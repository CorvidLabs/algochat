---
change: CHG-0002-run-the-existing-jdk-17-and-21-ci-matrix-when-trust-and-specsync-governance-file
artifact: plan
---

# Plan

1. Inventory every production Kotlin file and its existing unit or integration evidence.
2. Add canonical client, protocol, PSK, and cross-vector specs with stable requirements.
3. Enforce 100 percent production-source coverage in SpecSync and Trust.
4. Add Trust, SpecSync, Fledge, and Trust-workflow paths to both CI path filters.
5. Preserve the JDK matrix, Gradle setup, build, test, and artifact steps.
6. Validate locally with isolated JDK 17 and require both hosted matrix jobs.
