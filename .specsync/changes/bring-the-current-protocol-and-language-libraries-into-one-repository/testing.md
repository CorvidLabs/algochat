---
change: bring-the-current-protocol-and-language-libraries-into-one-repository
artifact: testing
---

# Testing

`bun scripts/validate.ts` checks the protocol documents and the implementation registry.

Each library keeps its own suite: `bun test` in ts, `swift test` in swift, `pytest` in py, `cargo test` in rs, `./gradlew test` in kt, and `go test ./...` in go. `.github/workflows/libraries.yml` runs those on pull request.
