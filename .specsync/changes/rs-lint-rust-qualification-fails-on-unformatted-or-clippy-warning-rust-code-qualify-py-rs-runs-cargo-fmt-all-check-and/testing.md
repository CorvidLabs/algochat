---
change: rs-lint-rust-qualification-fails-on-unformatted-or-clippy-warning-rust-code-qualify-py-rs-runs-cargo-fmt-all-check-and
artifact: testing
---

# Testing

- Red first: the new QualifyLaneTests case fails on the current `qualify.py`.
- Green: `cd scripts/release && python3 -m unittest test_release` passes.
- Clean clone at the PR head: `python3 scripts/release/qualify.py rs <out>` exits 0, and commands.json lists the fmt and clippy invocations.
- Negative probes, each in a scratch clone with a scratch commit: an unformatted line in rs/src makes `qualify.py rs` fail at the fmt step, and a test-only clippy warning (e.g. `let x = 1; let _ = x.clone();` in a #[test]) fails at the clippy step.
- `fledge lanes run verify` in rs/ and `fledge trust verify` pass.
- Hosted: Rust and release-qualification checks green on the PR head.

## Evidence

Pending.
