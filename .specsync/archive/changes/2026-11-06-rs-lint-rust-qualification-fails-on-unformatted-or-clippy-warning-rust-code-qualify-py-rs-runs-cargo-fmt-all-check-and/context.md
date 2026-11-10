---
change: rs-lint-rust-qualification-fails-on-unformatted-or-clippy-warning-rust-code-qualify-py-rs-runs-cargo-fmt-all-check-and
artifact: context
---

# Context

At #75's head `e50eef5` (#70a), `cargo fmt --all -- --check` failed in five Rust files: tests/conformance.rs, tests/cross_impl.rs, src/group.rs, src/group_admin.rs and src/pq.rs. The worker ac-acpq found it with `fledge lanes run verify` in rs/, whose first step is fmt. Hosted CI stayed green because `qualify.py rs` (used by rs.yml, release-qualification.yml and publish-crates.yml) runs neither rustfmt nor clippy. origin/main was clean. #75 was fixed by the rustfmt-only commit `b867cf8`. Leif (2026-11-05 20:24 MST) asked for this separate change so CI catches it, with a failing test first, and any clippy hits fixed in the same PR.

At `b867cf8`, `cargo fmt --all -- --check` and `cargo clippy --all-targets -- -D warnings` (clippy 0.1.95) both pass, so no code fix is expected. `--all-targets` is stricter than the verify lane's `cargo clippy -- -D warnings`, because it also lints tests.

Ruled out: changing workflows (REQ-release-2 keeps qualification read-only, and all three callers already go through `qualify.py rs`), and pinning the toolchain (out of scope). The checks run on the stable toolchain on ubuntu-latest, which includes rustfmt and clippy. A new stable lint can therefore fail qualification, including the qualification step of a publish, without any code change. This is accepted; the fix would be a follow-up, never a weaker `-D warnings`.
