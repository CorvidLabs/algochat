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

Local, 2026-11-05, macOS arm64, rustc/cargo 1.95.0, rustfmt 1.9.0-stable, clippy 0.1.95, Python 3.14.

- Red: at `696b5d9`, `python3 -m unittest test_release` failed 1 of 41 (`test_rust_lane_checks_format_and_lints_before_tests`).
- Green: at `2c00143`, 41 tests OK; `specsync check` 3 passed, 0 warnings.
- Clean clone at `2c00143`: `qualify.py rs` exit 0, tree_state clean; the commands, in order, are the four version probes, `generate-lockfile`, `cargo fmt --all -- --check`, `cargo clippy --all-targets --locked -- -D warnings`, `cargo test --locked` in rs/, `cargo package --locked`, `cargo test --locked` in the extracted crate, and the consumer `cargo run`. The receipt records the rustfmt and clippy versions. Crate sha256 prefix 9d1ab6ac37db93e7.
- Probe, unformatted line appended to rs/src/lib.rs (scratch commit): `qualify.py rs` exit 1, stopped at `cargo fmt --all -- --check`.
- Probe, test-only `value.clone()` on a `u8` in rs/tests/cross_impl.rs (scratch commit): `qualify.py rs` exit 1, stopped at clippy with `using clone on type u8 which implements the Copy trait`.
- `fledge lanes run verify` in rs/: exit 0. `fledge trust verify --range origin/main..HEAD`: trust gate passed (progressive provenance; attest provenance degraded, as before).
- Hosted: pending the PR.
