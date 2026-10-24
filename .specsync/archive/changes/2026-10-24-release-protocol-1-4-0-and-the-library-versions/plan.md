---
change: release-protocol-1-4-0-and-the-library-versions
artifact: plan
---

# Plan

## Approach

Set the protocol version to 1.4.0 and bump each library's source version. Keep tag v1.3.0 and go/v0.2.0 as the previous release.

## Out of scope

No new registry credentials. Python and Rust stay source versions until a publisher is configured. Historical 1.3.0 evidence stays historical.

## Steps

1. Update the version table, manifests, and the Kotlin coordinate the release check expects.
2. Tag v1.4.0 and go/v0.3.0 after the candidate checks pass.
3. Publish the TypeScript package with the existing GitHub Packages workflow.

## Risks

A hardcoded 0.2.0 Kotlin check would reject the 0.3.0 jar. The release tests cover that coordinate.

## Constraints consulted

Path filters stay as they are. A README-only change still does not run the language matrix. No workflow gains a new registry token.
