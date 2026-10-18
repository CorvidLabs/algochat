## Modified

### REQUIREMENT REQ-release-5

Release instructions SHALL distinguish protocol tag `v1.3.0` from each library version. The source for every library SHALL be `CorvidLabs/algochat`. Package versions remain TypeScript `0.9.0`, Python `0.2.0`, Rust `0.3.0`, and Kotlin `0.2.0`. The Go module path SHALL be `github.com/CorvidLabs/algochat/go`, released by tag `go/v0.2.0`. The Swift package name SHALL be `algochat` and the product SHALL be `AlgoChat`, released by repository tag `v1.3.0`. Kotlin coordinates SHALL be `com.corvidlabs:kt-algochat:0.2.0` on GitHub Packages for this repository. Archived repositories stay archived. Publication credentials stay unconfigured until a separate authorization.

#### Acceptance Criteria

- the release record names those identities and tags
- qualification rejects a Go module path other than `github.com/CorvidLabs/algochat/go`
- no workflow gains a registry token, OIDC publish grant, or tag push

### REQUIREMENT REQ-release-8

Consumer qualification SHALL exercise built artifacts from outside the source checkout where feasible.

#### Acceptance Criteria

- TypeScript tarball import/types; Python wheel and sdist import; Rust packaged crate; Kotlin POM and local Maven consumer; Go module `github.com/CorvidLabs/algochat/go` with any local replacement explicitly labeled; root Swift package consumer. Declared runtime minima are checked where feasible and gaps documented.
