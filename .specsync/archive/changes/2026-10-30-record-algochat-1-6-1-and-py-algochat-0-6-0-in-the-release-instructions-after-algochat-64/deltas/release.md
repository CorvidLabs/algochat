## Modified

### REQUIREMENT REQ-release-5

Release instructions SHALL distinguish release tag `v1.6.1` and protocol specification `1.6.0` from each library version. The source for every library SHALL be `CorvidLabs/algochat`. Package versions are TypeScript `0.12.0`, Python `0.6.0`, Rust `0.6.0`, and Kotlin `0.5.0`. The Go module path SHALL be `github.com/CorvidLabs/algochat/go`, released by tag `go/v0.5.0`, unchanged in 1.6.1. The Swift package name SHALL be `algochat` and the product SHALL be `AlgoChat`, released by repository tag `v1.6.1`. Kotlin coordinates SHALL be `com.corvidlabs:kt-algochat:0.5.0` on GitHub Packages for this repository. Tag `v1.6.0` and `go/v0.5.0` remain the previous release. Archived repositories stay archived. Publication credentials stay unconfigured until a separate authorization. CHANGELOG.md SHALL describe what the release adds.

#### Acceptance Criteria

- the release record names those identities and tags
- qualification rejects a Go module path other than `github.com/CorvidLabs/algochat/go`
- no workflow gains a registry token, OIDC publish grant, or tag push
