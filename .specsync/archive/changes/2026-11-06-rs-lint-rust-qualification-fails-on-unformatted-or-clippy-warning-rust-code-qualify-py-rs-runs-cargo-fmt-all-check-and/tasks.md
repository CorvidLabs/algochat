---
change: rs-lint-rust-qualification-fails-on-unformatted-or-clippy-warning-rust-code-qualify-py-rs-runs-cargo-fmt-all-check-and
artifact: tasks
---

# Tasks

- [x] Add a failing release test: in QualifyLaneTests, the rs lane runs `cargo fmt --all -- --check` and `cargo clippy --all-targets --locked -- -D warnings` in rs/, after `generate-lockfile` and before the first `cargo test`.
- [x] Extend `qualify.py rs`: record the rustfmt and clippy versions, then run both commands.
- [x] Fix any clippy or rustfmt hits (none: both passed at `b867cf8`, so no code change).
- [x] Update specs/release (spec text, testing.md) and CHANGELOG.md.
- [x] Run the release tests, clean-clone `qualify.py rs`, a scratch probe for each check (one unformatted line, one clippy warning; each makes `qualify.py rs` exit non-zero), `fledge lanes run verify` and `fledge trust verify`, and record the evidence.
- [x] Open the PR without merging (opened after this check; never merged by an agent without the gates).
