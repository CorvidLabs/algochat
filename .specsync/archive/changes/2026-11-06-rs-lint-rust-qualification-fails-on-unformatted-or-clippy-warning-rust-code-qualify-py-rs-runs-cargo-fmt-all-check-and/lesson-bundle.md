# Lesson bundle: rs-lint-rust-qualification-fails-on-unformatted-or-clippy-warning-rust-code-qualify-py-rs-runs-cargo-fmt-all-check-and

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Rs-lint: Rust qualification fails on unformatted or clippy-warning Rust code: qualify.py rs runs cargo fmt --all -- --check and cargo clippy --all-targets --locked -- -D warnings in rs/ before the tests, so hosted CI catches what the rs verify lane catches
- **Kind**: BugFix
- **Specs**: release
- **Paths**: scripts/release/
- **Acceptance**: qualify.py rs runs cargo fmt --all -- --check and cargo clippy --all-targets --locked -- -D warnings in rs/ after the lockfile is generated and before cargo test, records the rustfmt and clippy versions, and exits non-zero on a formatting diff or any clippy warning (a release test asserts both commands are in the rs lane, and a local probe with one unformatted line and one clippy warning each makes qualify.py rs fail); hosted Rust CI and the publish-crates qualification step therefore enforce formatting and lints with no workflow change; the current tree passes both.

## Evidence

- Verification commit: `a2a5f540f425628a4d635a19b9aeaea5eaacd812`
- Base commit: `b867cf8fe8afaf9e7a4e899f5a58fb6dfd6f7f45`
- Verified by: `specsync check --spec release`

## From the change's context.md

# Context

At #75's head `e50eef5` (#70a), `cargo fmt --all -- --check` failed in five Rust files: tests/conformance.rs, tests/cross_impl.rs, src/group.rs, src/group_admin.rs and src/pq.rs. The worker ac-acpq found it with `fledge lanes run verify` in rs/, whose first step is fmt. Hosted CI stayed green because `qualify.py rs` (used by rs.yml, release-qualification.yml and publish-crates.yml) runs neither rustfmt nor clippy. origin/main was clean. #75 was fixed by the rustfmt-only commit `b867cf8`. Leif (2026-11-05 20:24 MST) asked for this separate change so CI catches it, with a failing test first, and any clippy hits fixed in the same PR.

At `b867cf8`, `cargo fmt --all -- --check` and `cargo clippy --all-targets -- -D warnings` (clippy 0.1.95) both pass, so no code fix is expected. `--all-targets` is stricter than the verify lane's `cargo clippy -- -D warnings`, because it also lints tests.

Ruled out: changing workflows (REQ-release-2 keeps qualification read-only, and all three callers already go through `qualify.py rs`), and pinning the toolchain (out of scope). The checks run on the stable toolchain on ubuntu-latest, which includes rustfmt and clippy. A new stable lint can therefore fail qualification, including the qualification step of a publish, without any code change. This is accepted; the fix would be a follow-up, never a weaker `-D warnings`.

## From the change's testing.md

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

## Where these lessons go

- `specs/release/context.md`
