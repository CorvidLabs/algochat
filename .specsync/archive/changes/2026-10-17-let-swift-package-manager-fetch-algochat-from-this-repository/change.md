---
id: let-swift-package-manager-fetch-algochat-from-this-repository
state: archived
type: feature
base_commit: 7878122f267307f6c9d6b4898f266548d0a4e8a3
---

# Let Swift Package Manager fetch AlgoChat from this repository

## Intent

Let Swift Package Manager fetch AlgoChat from this repository

## Affected Canonical Specs

- None

## Acceptance Criteria

- swift test from the repository root builds the AlgoChat library and its unit tests. A package can depend on https://github.com/CorvidLabs/algochat.git and use the AlgoChat product.

## No-spec Rationale

The wire format is unchanged. Package.swift moves to the repository root and points at the existing Swift sources.
