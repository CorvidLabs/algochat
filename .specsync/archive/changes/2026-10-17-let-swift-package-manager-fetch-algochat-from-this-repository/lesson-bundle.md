# Lesson bundle — let-swift-package-manager-fetch-algochat-from-this-repository

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Let Swift Package Manager fetch AlgoChat from this repository
- **Kind**: Feature
- **Paths**: Package.swift, swift, README.md, .github/workflows/swift.yml, .github/workflows/status.yml, .github/workflows/trust.yml, .gitignore
- **Acceptance**: swift test from the repository root builds the AlgoChat library and its unit tests. A package can depend on https://github.com/CorvidLabs/algochat.git and use the AlgoChat product.

## Evidence

- Verification commit: `b0455d4a473abaefad2e7ff90d28d9b3d4c12286`
- Base commit: `7878122f267307f6c9d6b4898f266548d0a4e8a3`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

Swift Package Manager only reads Package.swift at the root of a git URL. The manifest was in swift/, so CorvidLabs/algochat was not a Swift package. The archived swift-algochat repository still serves tag 0.4.0 and cannot take new tags.

## From the change's testing.md

# Testing

`swift test` from the repository root. The library and the in-process suites build and pass. Localnet suites still require Docker at /opt/homebrew/bin/docker.

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
