## Modified

### REQUIREMENT REQ-release-2

PR qualification SHALL have read-only repository permissions and no publication step, publish credentials, OIDC grant, tag, release or production action. Publication SHALL happen only in a separate, manually dispatched publish workflow; no qualification workflow calls one.

#### Acceptance Criteria

- inspection and automated checks reject publication-capable additions to every qualification workflow.

### REQUIREMENT REQ-release-3

Artifact validation SHALL reject missing expected package files, incorrect package identities and malformed archives. The Rust crate SHALL contain only its manifest, `Cargo.toml.orig`, `Cargo.lock`, `.cargo_vcs_info.json`, `README.md`, `LICENSE` and `src/*.rs` library sources, and its manifest SHALL name `https://github.com/CorvidLabs/algochat` as its repository.

#### Acceptance Criteria

- positive and negative fixtures exercise those failures and CI inspects real artifacts.
- a Rust crate with a binary source, test, workflow, agent or spec file, or with the archived `rs-algochat` repository URL, is rejected.

### REQUIREMENT REQ-release-5

Release instructions SHALL distinguish release tag `v1.6.2` and protocol specification `1.6.0` from each library version. The source for every library SHALL be `CorvidLabs/algochat`. Package versions are TypeScript `0.12.0`, Python `0.6.0`, Rust `0.6.0`, and Kotlin `0.5.0`. Rust `0.6.0` SHALL be published from tag `v1.6.2`, whose `rs/src` is identical to tag `v1.6.1`. The Go module path SHALL be `github.com/CorvidLabs/algochat/go`, released by tag `go/v0.5.0`, unchanged in 1.6.2. The Swift package name SHALL be `algochat` and the product SHALL be `AlgoChat`, released by repository tag `v1.6.2`. Kotlin coordinates SHALL be `com.corvidlabs:kt-algochat:0.5.0` on GitHub Packages for this repository. Tag `v1.6.1` and `go/v0.5.0` remain the previous release. Archived repositories stay archived. The crates.io trusted publisher is the only configured registry publisher besides the existing TypeScript GitHub Packages workflow; other publication credentials stay unconfigured until a separate authorization. Registry availability SHALL be recorded only from dated external-consumer evidence. CHANGELOG.md SHALL describe what the release adds.

#### Acceptance Criteria

- the release record names those identities and tags
- qualification rejects a Go module path other than `github.com/CorvidLabs/algochat/go`
- no qualification workflow gains a registry token, OIDC publish grant, or tag push

## Added

### REQUIREMENT REQ-release-9

The Rust crate SHALL be published to crates.io only by `.github/workflows/publish-crates.yml`: manual dispatch from `main` naming an existing `vX.Y.Z` tag reachable from `main` and the `X.Y.Z` version that tag's `rs/Cargo.toml` declares for `algochat`, in the `crates-io` environment, after the Rust qualification lane passes on that commit, with a short-lived crates.io trusted-publishing token from a commit-pinned `rust-lang/crates-io-auth-action` and no stored registry secret.

#### Acceptance Criteria

- release tests fail if the workflow gains a push, pull-request or tag trigger, loses the environment, tag, ancestry, version or qualification guard, persists checkout credentials, reads a stored secret, grants a write permission other than `id-token`, or unpins the auth action.
