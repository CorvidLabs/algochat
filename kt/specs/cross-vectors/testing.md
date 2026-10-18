---
spec: cross-vectors.spec.md
---

## Test Plan

### Unit Tests

- Validate hex/seed parsing and expected plaintext through each producer-specific method in `CrossImplTest`.

### Integration Tests

- Run the complete Gradle test task so all committed vectors use the same production classes packaged by the Kotlin build.

## Actual fixture behavior

`CrossImplTest` reads optional sibling `.hex` directories and skips absent directories/files. Count executed inputs before claiming producer coverage. The export test writes `../test-envelopes-kotlin`, so it generates files outside `kt/`; generated envelopes must not be mistaken for committed vectors. `PQTest` instead reads committed `vectors/pq-mlkem768.json`.
