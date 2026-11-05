---
change: release-a-publish-rust-algochat-0-6-0-from-tag-v1-6-2-with-packaging-only-fixes-and-a-crates-io-trusted-publisher
artifact: tasks
---

# Tasks

- [ ] Add failing `PackageTests` for Rust extra members and the archived repository URL; update the Rust positive fixture.
- [ ] Add failing `PublishCratesWorkflowTests` for the publish workflow guards.
- [ ] Add a test that `rs/src` is identical to tag `v1.6.1` when that tag is available.
- [ ] Update `rs/Cargo.toml` metadata and `include`.
- [ ] Delete `rs/.github/workflows/release.yml`.
- [ ] Extend `validate_package` for Rust.
- [ ] Add `.github/workflows/publish-crates.yml`.
- [ ] Update `rs/README.md`, `docs/RELEASE.md`, `CHANGELOG.md`, `README.md`, `swift/README.md`, `index.html`.
- [ ] Update `specs/release` spec, requirements and testing.
- [ ] Run release tests, Rust qualification, packaging checks and `fledge trust verify`; record evidence.
- [ ] Open the PR without merging.
