---
id: release-a-publish-rust-algochat-0-6-0-from-tag-v1-6-2-with-packaging-only-fixes-and-a-crates-io-trusted-publisher
state: implementing
type: feature
base_commit: fae3900f9729724c088bdbe67faf2d8a69655dec
---

# Release A: publish Rust algochat 0.6.0 from tag v1.6.2 with packaging-only fixes and a crates.io trusted-publisher workflow (algochat#67)

## Intent

Release A: publish Rust algochat 0.6.0 from tag v1.6.2 with packaging-only fixes and a crates.io trusted-publisher workflow (algochat#67)

## Affected Canonical Specs

- `release`

## Acceptance Criteria

- A crate packaged from the candidate is algochat 0.6.0 with only its manifest, lockfile, README, LICENSE and src/ library sources and the CorvidLabs/algochat repository link; rs/src stays identical to v1.6.1; and the only publish path is a manual crates.io trusted-publisher workflow for a matching v-tag behind the protected crates-io environment, guarded by release tests.

## No-spec Rationale

Not applicable
