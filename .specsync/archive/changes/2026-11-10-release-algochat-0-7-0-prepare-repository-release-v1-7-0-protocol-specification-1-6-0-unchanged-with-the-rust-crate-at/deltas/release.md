## Modified

### REQUIREMENT REQ-release-5

Release instructions SHALL distinguish release tag `v1.7.0` and protocol specification `1.6.0` from each library version. The source for every library SHALL be `CorvidLabs/algochat`. Package versions are TypeScript `0.12.1`, Python `0.6.1`, Rust `0.7.0`, and Kotlin `0.5.0`. Rust `0.7.0` SHALL be published from tag `v1.7.0`, only after the owner approves that release. The Go module path SHALL be `github.com/CorvidLabs/algochat/go`, released by tag `go/v0.5.0`, unchanged in 1.7.0. The Swift package name SHALL be `algochat` and the product SHALL be `AlgoChat`, released by repository tag `v1.7.0`, with Swift sources unchanged since `v1.6.2`. Kotlin coordinates SHALL be `com.corvidlabs:kt-algochat:0.5.0` on GitHub Packages for this repository. Tag `v1.6.2` and `go/v0.5.0` remain the previous release. Archived repositories stay archived. The crates.io trusted publisher is the only configured registry publisher besides the existing TypeScript GitHub Packages workflow; other publication credentials stay unconfigured until a separate authorization. Registry availability SHALL be recorded only from dated external-consumer evidence. CHANGELOG.md SHALL describe what the release adds.

#### Acceptance Criteria

- the release record names those identities and tags
- qualification rejects a Go module path other than `github.com/CorvidLabs/algochat/go`
- no qualification workflow gains a registry token, OIDC publish grant, or tag push
- the Rust qualification lane packages, verifies and tests `algochat-0.7.0.crate`
