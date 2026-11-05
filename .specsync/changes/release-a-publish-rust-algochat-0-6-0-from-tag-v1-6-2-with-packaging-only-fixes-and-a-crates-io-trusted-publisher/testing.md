---
change: release-a-publish-rust-algochat-0-6-0-from-tag-v1-6-2-with-packaging-only-fixes-and-a-crates-io-trusted-publisher
artifact: testing
---

# Testing

Planned (not yet run):

| Requirement | Check |
| --- | --- |
| REQ-release-2 | `python3 -m unittest discover -s scripts/release -v`: existing `WorkflowTests` still pass for all qualification workflows |
| REQ-release-3 | new `PackageTests`: crate with `src/bin/pqcross.rs`, `tests/`, `.github/` member or `rs-algochat` URL rejected; clean crate accepted; `qualify.py rs` on the candidate accepts the real crate |
| REQ-release-5 | `git diff --exit-code v1.6.1 HEAD -- rs/src` and its unit test; docs name `v1.6.2` and make no availability claim |
| REQ-release-9 | new `PublishCratesWorkflowTests` with mutation cases for each guard |
| package boundary | `cargo package --list` in `rs/` lists only the allowed members; `cargo build --bin pqcross` succeeds |

Repository gates: `fledge run verify` (root), `fledge run verify` in `rs/`, `fledge trust verify`.

After merge, tag and publish (Leif's steps, not part of this change's verification): a fresh project outside the repository resolves `algochat = "0.6.0"` from crates.io and builds, alone and with `algonaut = "0.9.0"`; the result is recorded with its date in `docs/RELEASE.md` and closes #67.
