---
spec: release.spec.md
---

# Requirements

### REQ-release-1

Qualification SHALL run each existing language test lane plus safe build/package validation for TypeScript, Swift, Python, Rust, Kotlin and Go.

#### Acceptance Criteria

- all six run on the exact final PR commit and preserve distinct per-language evidence.

### REQ-release-2

PR qualification SHALL have read-only repository permissions and no publication step, publish credentials, OIDC grant, tag, release or production action.

#### Acceptance Criteria

- inspection and automated checks reject publication-capable additions.

### REQ-release-3

Artifact validation SHALL reject missing expected package files, incorrect package identities and malformed archives.

#### Acceptance Criteria

- positive and negative fixtures exercise those failures and CI inspects real artifacts.

### REQ-release-4

Release provenance SHALL require an explicit nonempty ancestor range and .attest.json verification, preserving failure for absent evidence.

#### Acceptance Criteria

- invalid, empty and missing-evidence ranges fail; the documented historical gap stays open until an authorized owner supplies truthful evidence.

### REQ-release-5

Release instructions SHALL distinguish protocol 1.3.0 from package versions and preserve current names, repositories and destinations.

#### Acceptance Criteria

- explicit owner checklist covers Go module source mapping, Swift source/tag choice, TypeScript/Kotlin GitHub Packages permissions and Python/Rust trusted-publisher configuration without configuring them.

### REQ-release-6

Evidence SHALL identify commit, tool versions, commands, results and provenance category.

#### Acceptance Criteria

- local, hosted, author-reported and unrun checks are separate; Linux Swift does not claim ML-KEM support; no unsupported 95% claim is made.

### REQ-release-7

Evidence SHALL record exact SHA, tree state, platform/toolchain, commands, outcomes and artifact hashes.

#### Acceptance Criteria

- missing language/artifact, failed command, skipped required Apple lane, stale SHA, hash mismatch and malformed evidence cannot produce all-six success. Existing soft provenance policy remains unchanged.

### REQ-release-8

Consumer qualification SHALL exercise built artifacts from outside the source checkout where feasible.

#### Acceptance Criteria

- TypeScript tarball import/types; Python wheel and sdist import; Rust packaged crate; Kotlin POM and local Maven consumer; Go existing module identity with any local replacement explicitly labeled; root Swift package consumer. Declared runtime minima are checked where feasible and gaps documented.
