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

Release instructions SHALL distinguish protocol tag `v1.3.0` from each library version. The source for every library SHALL be `CorvidLabs/algochat`. Package versions remain TypeScript `0.9.0`, Python `0.2.0`, Rust `0.3.0`, and Kotlin `0.2.0`. The Go module path SHALL be `github.com/CorvidLabs/algochat/go`, released by tag `go/v0.2.0`. The Swift package name SHALL be `algochat` and the product SHALL be `AlgoChat`, released by repository tag `v1.3.0`. Kotlin coordinates SHALL be `com.corvidlabs:kt-algochat:0.2.0` on GitHub Packages for this repository. Archived repositories stay archived. Publication credentials stay unconfigured until a separate authorization.

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

