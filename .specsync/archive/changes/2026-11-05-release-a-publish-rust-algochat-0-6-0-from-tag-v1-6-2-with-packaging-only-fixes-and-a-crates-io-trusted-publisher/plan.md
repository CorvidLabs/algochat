---
change: release-a-publish-rust-algochat-0-6-0-from-tag-v1-6-2-with-packaging-only-fixes-and-a-crates-io-trusted-publisher
artifact: plan
---

# Plan

## Approach

Ship the already-tagged Rust 0.6.0 source with clean packaging, and add one guarded trusted-publisher workflow so Leif can publish it after approving the release. Tests that describe new behavior are written first and must fail before the implementation.

## Out of scope

Any change under `rs/src`; the tag `v1.6.2`; any crates.io publication or configuration (Leif's own steps); self-contained packaged vectors and new APIs (Release B: #70, #73, #68); Falcon, attachments and channel rules (#69, #72, #71); other languages' publishing; Raven Desktop.

## Steps

1. Failing tests: Rust package members and repository URL in `test_release.py`; publish-workflow guard tests; a test that `rs/src` matches `v1.6.1`.
2. `rs/Cargo.toml` metadata and `include`; delete `rs/.github/workflows/release.yml`.
3. `validate_package` Rust member and repository checks.
4. `.github/workflows/publish-crates.yml`.
5. Docs: `rs/README.md`, `docs/RELEASE.md`, `CHANGELOG.md` 1.6.2, root `README.md`, `swift/README.md`, `index.html`, release spec and requirements.
6. Verify: release tests, `qualify.py rs` locally, `cargo package --list`, `cargo build --bin pqcross`, `fledge run verify` lanes, `fledge trust verify`.
7. Open a PR; never merge. Leif approves release, configures crates.io and dispatches.

## Risks

- A trusted publisher still bound to the archived repo could let that repo publish; Leif removes it.
- `workflow_dispatch` can run a branch's copy of the workflow; the main-only job guard and the environment's deployment-branch rule both prevent that.
- Excluding `tests/` means the published crate cannot re-run its vector tests; that stays a documented gap closed by Release B (#70a).
- `ctutils = "=0.4.2"` may conflict with Raven Desktop's graph; the post-publish external consumer checks it with algonaut 0.9.0.

## Constraints consulted

A git tag is not a registry publication: availability is recorded only from dated external-consumer evidence (1.6.0 and 1.6.1 release lessons). Qualification lanes stay read-only.
