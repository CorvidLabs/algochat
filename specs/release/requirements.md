---
spec: release.spec.md
---

# Requirements

### REQ-release-1

Qualification SHALL run each existing language test lane plus safe build/package validation for TypeScript, Swift, Python, Rust, Kotlin and Go. Rust qualification SHALL also run `cargo test --locked` inside the extracted crate, and TypeScript qualification SHALL run `bun conformance/tools/verify.mjs`.

#### Acceptance Criteria

- a change to one language tree runs that language on the PR head and preserves its evidence
- a change to the protocol, vectors, or release scripts runs all six, plus Swift Linux, on that same head
- a README, docs, or intent-only change does not start those lanes
- the Rust lane fails when a test fails inside the extracted crate, and the TypeScript lane fails when the vector verifier fails

### REQ-release-2

PR qualification SHALL have read-only repository permissions and no publication step, publish credentials, OIDC grant, tag, release or production action. Publication SHALL happen only in a separate, manually dispatched publish workflow; no qualification workflow calls one.

#### Acceptance Criteria

- inspection and automated checks reject publication-capable additions to every qualification workflow.

### REQ-release-3

Artifact validation SHALL reject missing expected package files, incorrect package identities and malformed archives. The Rust crate SHALL contain only its manifest, `Cargo.toml.orig`, `Cargo.lock`, `.cargo_vcs_info.json`, `README.md`, `LICENSE`, `src/*.rs` library sources, `tests/*.rs` integration tests and `vectors/*.json` vector copies, and its manifest SHALL name `https://github.com/CorvidLabs/algochat` as its repository. Each file in `rs/vectors/` SHALL be byte-identical to its canonical source in `vectors/` or `ts/conformance/vectors/`, and every canonical source Rust reads SHALL have a copy.

#### Acceptance Criteria

- positive and negative fixtures exercise those failures and CI inspects real artifacts.
- a Rust crate with a binary source, example, nested test or source directory, workflow, agent or spec file, or with the archived `rs-algochat` repository URL, is rejected.
- a missing, extra or differing `rs/vectors/` copy is rejected before Rust tests run.

### REQ-release-4

Release provenance SHALL require an explicit nonempty ancestor range and .attest.json verification, preserving failure for absent evidence.

#### Acceptance Criteria

- invalid, empty and missing-evidence ranges fail; the documented historical gap stays open until an authorized owner supplies truthful evidence.

### REQ-release-5

Release instructions SHALL distinguish release tag `v1.6.2` and protocol specification `1.6.0` from each library version. The source for every library SHALL be `CorvidLabs/algochat`. Package versions are TypeScript `0.12.0`, Python `0.6.0`, Rust `0.6.0`, and Kotlin `0.5.0`. Rust `0.6.0` SHALL be published from tag `v1.6.2`, whose `rs/src` is identical to tag `v1.6.1`. The Go module path SHALL be `github.com/CorvidLabs/algochat/go`, released by tag `go/v0.5.0`, unchanged in 1.6.2. The Swift package name SHALL be `algochat` and the product SHALL be `AlgoChat`, released by repository tag `v1.6.2`. Kotlin coordinates SHALL be `com.corvidlabs:kt-algochat:0.5.0` on GitHub Packages for this repository. Tag `v1.6.1` and `go/v0.5.0` remain the previous release. Archived repositories stay archived. The crates.io trusted publisher is the only configured registry publisher besides the existing TypeScript GitHub Packages workflow; other publication credentials stay unconfigured until a separate authorization. Registry availability SHALL be recorded only from dated external-consumer evidence. CHANGELOG.md SHALL describe what the release adds.

#### Acceptance Criteria

- the release record names those identities and tags
- qualification rejects a Go module path other than `github.com/CorvidLabs/algochat/go`
- no qualification workflow gains a registry token, OIDC publish grant, or tag push

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

### REQ-release-9

The Rust crate SHALL be published to crates.io only by `.github/workflows/publish-crates.yml`: manual dispatch from `main` naming an existing `vX.Y.Z` tag reachable from `main` and the `X.Y.Z` version that tag's `rs/Cargo.toml` declares for `algochat`, in the `crates-io` environment, after the Rust qualification lane passes on that commit, with a short-lived crates.io trusted-publishing token from a commit-pinned `rust-lang/crates-io-auth-action` and no stored registry secret.

#### Acceptance Criteria

- release tests fail if the workflow gains a push, pull-request or tag trigger, loses the environment, tag, ancestry, version or qualification guard, persists checkout credentials, reads a stored secret, grants a write permission other than `id-token`, or unpins the auth action.

