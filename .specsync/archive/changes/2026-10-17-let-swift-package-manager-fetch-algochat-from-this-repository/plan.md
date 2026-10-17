---
change: let-swift-package-manager-fetch-algochat-from-this-repository
artifact: plan
---

# Plan

## Approach

Put Package.swift at the repository root. Point the library, the command-line tool, and the tests at swift/Sources and swift/Tests. Remove the nested manifest so there is one package. Run Swift CI from the root.

## Out of scope

No wire-format change. No new release tag. The archived 0.4.0 tag stays valid.

## Steps

1. Add the root manifest.
2. Delete swift/Package.swift.
3. Point the README and the Swift workflow at the root.
4. Run swift test from the root.

## Risks

Localnet tests still look for Docker at /opt/homebrew/bin/docker and fail when that file is absent. That is unchanged.

## Constraints consulted

The protocol bytes stay 0x01 and 0x02.
