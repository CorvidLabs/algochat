---
spec: cross-vectors.spec.md
---

## Test Plan

### Unit Tests

- Validate hex/seed parsing and expected plaintext through each producer-specific method in `CrossImplTest`.

### Integration Tests

- Run the complete Gradle test task so all committed vectors use the same production classes packaged by the Kotlin build.
