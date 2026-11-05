---
change: release-a-publish-rust-algochat-0-6-0-from-tag-v1-6-2-with-packaging-only-fixes-and-a-crates-io-trusted-publisher
artifact: testing
---

# Testing

Plan:

| Requirement | Check |
| --- | --- |
| REQ-release-2 | `python3 -m unittest discover -s scripts/release -v`: existing `WorkflowTests` still pass for all qualification workflows |
| REQ-release-3 | new `PackageTests`: crate with `src/bin/pqcross.rs`, `tests/`, `.github/` member or `rs-algochat` URL rejected; clean crate accepted; `qualify.py rs` on the candidate accepts the real crate |
| REQ-release-5 | `git diff --exit-code v1.6.1 HEAD -- rs/src` and its unit test; docs name `v1.6.2` and make no availability claim |
| REQ-release-9 | new `PublishCratesWorkflowTests` with mutation cases for each guard |
| package boundary | `cargo package --list` in `rs/` lists only the allowed members; `cargo build --bin pqcross` succeeds |

Repository gates: `fledge run verify` (root), `fledge run verify` in `rs/`, `fledge trust verify`.

After merge, tag and publish (Leif's steps, not part of this change's verification): a fresh project outside the repository resolves `algochat = "0.6.0"` from crates.io and builds, alone and with `algonaut = "0.9.0"`; the result is recorded with its date in `docs/RELEASE.md` and closes #67.

## Local evidence (macOS arm64, 2026-11-05)

- Test first: at `9d2128a` the new tests failed before implementation (`Ran 32 tests`, `FAILED (failures=12, errors=4)`): 12 boundary rejections were not raised and the 4 workflow tests could not read the missing workflow.
- At `a46d3fe` (implementation), `python3 -m unittest discover -s scripts/release -v`: 32 tests OK.
- `python3 scripts/release/qualify.py rs OUT` in a clean clone at `a46d3fe`: exit 0. `cargo test --locked` ran 272 tests with 0 failures; `cargo package --locked` built and verified `algochat-0.6.0.crate` (sha256 `95976eff9a413372ff452496c89c262c26bba326a8a17c2f476c95a42a69024e`); `validate_package` accepted it with the new boundary check; the extracted-crate consumer ran. Caveat: `rs/tests/cross_impl.rs` returns early when sibling fixture directories are absent, so this count is not cross-implementation evidence (#70a, Release B).
- `cargo package --list` in `rs/`: 26 entries, `.cargo_vcs_info.json`, `Cargo.lock`, `Cargo.toml`, `Cargo.toml.orig`, `LICENSE`, `README.md` and 20 `src/*.rs`.
- `cargo build --bin pqcross` in the clean clone: succeeded.
- `git diff --exit-code v1.6.1 HEAD -- rs/src`: no difference.
- `fledge lanes run verify` (root): `validate` and `release_checks` passed.

Not run here: the hosted Release qualification matrix (runs on the PR), any dispatch of `publish-crates.yml`, crates.io or GitHub environment configuration, and the post-publish external consumer.
