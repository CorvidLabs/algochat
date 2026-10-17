# Lesson bundle — bring-the-current-protocol-and-language-libraries-into-one-repository

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Bring the current protocol and language libraries into one repository
- **Kind**: Migration
- **Paths**: PROTOCOL.md, TEST-VECTORS.md, SECURITY.md, IMPLEMENTATION.md, implementations.json, hi, ts, swift, py, rs, kt, go, .github
- **Acceptance**: The protocol documents and the TypeScript, Swift, Python, Rust, Kotlin, and Go libraries from their 4096-byte note releases are in this repository. Protocols stay 0x01 and 0x02. Post-quantum envelopes are absent. hi check passes and bun scripts/validate.ts passes.

## Evidence

- Verification commit: `85b6183d3ce350b6eb5b94f97afc32dc9cd744db`
- Base commit: `32b70eabbe39a6045d4557ab782c0fe150e6ce91`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

CorvidLabs/algochat was an empty repository with a title. The protocol and each language lived in separate repositories, so a wire-format change had to be repeated by hand. This change copies the 4096-byte note releases into one tree.

Post-quantum envelopes stay out. Raven stays out. Three unfinished SpecSync changes that belonged to protocol-algochat were not imported as active changes here.

## From the change's design.md

# Design

Protocol documents stay at the repository root. Each library keeps its own package layout under ts, swift, py, rs, kt, and go, taken from that library's 4096-byte note commit. The old repository names remain published. implementations.json records the new paths.

## From the change's testing.md

# Testing

`bun scripts/validate.ts` checks the protocol documents and the implementation registry.

Each library keeps its own suite: `bun test` in ts, `swift test` in swift, `pytest` in py, `cargo test` in rs, `./gradlew test` in kt, and `go test ./...` in go. `.github/workflows/libraries.yml` runs those on pull request.

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
