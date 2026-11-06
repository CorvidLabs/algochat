---
change: release-a-publish-rust-algochat-0-6-0-from-tag-v1-6-2-with-packaging-only-fixes-and-a-crates-io-trusted-publisher
artifact: tasks
---

# Tasks

- [x] Add failing `PackageTests` for Rust extra members and the archived repository URL; update the Rust positive fixture.
- [x] Add failing `PublishCratesWorkflowTests` for the publish workflow guards.
- [x] Check that `rs/src` is identical to tag `v1.6.1` with `git diff --exit-code v1.6.1 HEAD -- rs/src` (a one-off release check: a permanent unit test would fail once 0.7.0 changes `rs/src`).
- [x] Update `rs/Cargo.toml` metadata and `include`.
- [x] Delete `rs/.github/workflows/release.yml`.
- [x] Extend `validate_package` for Rust.
- [x] Add `.github/workflows/publish-crates.yml`.
- [x] Update `rs/README.md`, `docs/RELEASE.md`, `CHANGELOG.md`, `README.md`, `swift/README.md`, `index.html`.
- [x] Update `specs/release` spec, requirements and testing.
- [x] Run release tests, Rust qualification, packaging checks and `fledge trust verify`; record evidence.
- [x] Open the PR without merging (opened after this check; never merged by an agent).
