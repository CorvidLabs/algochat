# Lesson bundle: cover-the-1-5-0-version-labels-in-the-release-scripts

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Cover the 1.5.0 version labels in the release scripts
- **Kind**: Documentation
- **Paths**: TEST-VECTORS.md, scripts/release/packages.py, scripts/release/qualify.py, scripts/release/test_release.py
- **Acceptance**: The test vector header and release scripts name the prepared 1.5.0 library versions.

## Evidence

- Verification commit: `cf17bdcd5571852dc27c18d966f769f3cd9b1f58`
- Base commit: `25a94e4257724b208a25edc8c6cdc1344cab50e1`
- Verified by: `specsync check --spec protocol --spec release`

## From the change's context.md

# Context

The prepared 1.5.0 labels in TEST-VECTORS.md and the release scripts were part of the version bump. The first archive did not list those paths, so the lifecycle audit reported them uncovered. This record covers them. It does not change the wire format, cut a tag, or publish a package.

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
