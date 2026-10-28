## Modified

### REQUIREMENT REQ-release-5

Release instructions SHALL distinguish protocol tag `v1.5.0` from each library version. The source for every library SHALL be `CorvidLabs/algochat`. Package versions are TypeScript `0.11.0`, Python `0.4.0`, Rust `0.5.0`, and Kotlin `0.4.0`. The Go module path SHALL be `github.com/CorvidLabs/algochat/go`, prepared as tag `go/v0.4.0`. The Swift package name SHALL be `algochat` and the product SHALL be `AlgoChat`, prepared as repository tag `v1.5.0`. Kotlin coordinates SHALL be `com.corvidlabs:kt-algochat:0.4.0` on GitHub Packages for this repository. Tag `v1.4.0` and `go/v0.3.0` remain the previous release. Archived repositories stay archived. Publication credentials stay unconfigured until a separate authorization. The tags are not cut until the owner says so.

#### Acceptance Criteria

- the release record names those identities and tags
- qualification rejects a Go module path other than `github.com/CorvidLabs/algochat/go`
- no workflow gains a registry token, OIDC publish grant, or tag push
