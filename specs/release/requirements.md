---
spec: release.spec.md
---

# Requirements

### REQ-release-1

Qualification SHALL run each existing language test lane plus safe build/package validation for TypeScript, Swift, Python, Rust, Kotlin and Go.

#### Acceptance Criteria

- a change to one language tree runs that language on the PR head and preserves its evidence
- a change to the protocol, vectors, or release scripts runs all six, plus Swift Linux, on that same head
- a README, docs, or intent-only change does not start those lanes

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

Release instructions SHALL distinguish release tag `v1.6.1` and protocol specification `1.6.0` from each library version. The source for every library SHALL be `CorvidLabs/algochat`. Package versions are TypeScript `0.12.0`, Python `0.6.0`, Rust `0.6.0`, and Kotlin `0.5.0`. The Go module path SHALL be `github.com/CorvidLabs/algochat/go`, released by tag `go/v0.5.0`, unchanged in 1.6.1. The Swift package name SHALL be `algochat` and the product SHALL be `AlgoChat`, released by repository tag `v1.6.1`. Kotlin coordinates SHALL be `com.corvidlabs:kt-algochat:0.5.0` on GitHub Packages for this repository. Tag `v1.6.0` and `go/v0.5.0` remain the previous release. Archived repositories stay archived. Publication credentials stay unconfigured until a separate authorization. CHANGELOG.md SHALL describe what the release adds.

#### Acceptance Criteria

- the release record names those identities and tags
- qualification rejects a Go module path other than `github.com/CorvidLabs/algochat/go`
- no workflow gains a registry token, OIDC publish grant, or tag push

### REQ-release-6

Evidence SHALL identify commit, tool versions, commands, results and provenance category.

#### Acceptance Criteria

- local, hosted, author-reported and unrun checks are separate; Linux Swift does not claim ML-KEM support; no unsupported 95% claim is made.
- dated parity evidence names the audited commit and retained data, with replay prerequisites and missing coverage visible.
- opt-in replay and history probes fail when the required behavior is violated or the execution cannot complete; observing a known defect is not a passing behavioral acceptance result.

### REQ-release-7

Evidence SHALL record exact SHA, tree state, platform/toolchain, commands, outcomes and artifact hashes.

#### Acceptance Criteria

- missing language/artifact, failed command, skipped required Apple lane, stale SHA, hash mismatch and malformed evidence cannot produce all-six success. Existing soft provenance policy remains unchanged.

### REQ-release-8

Consumer qualification SHALL exercise built artifacts from outside the source checkout where feasible.

#### Acceptance Criteria

- TypeScript tarball import/types; Python wheel and sdist import; Rust packaged crate; Kotlin POM and local Maven consumer; Go module `github.com/CorvidLabs/algochat/go` with any local replacement explicitly labeled; root Swift package consumer. Declared runtime minima are checked where feasible and gaps documented.
- When `npm pack --json` reports a scoped filename that is not the archive on disk, qualification consumes the archive that was written.

