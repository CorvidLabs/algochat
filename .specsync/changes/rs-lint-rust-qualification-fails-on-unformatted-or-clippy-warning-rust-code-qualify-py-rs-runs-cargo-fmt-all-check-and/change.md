---
id: rs-lint-rust-qualification-fails-on-unformatted-or-clippy-warning-rust-code-qualify-py-rs-runs-cargo-fmt-all-check-and
state: approved
type: bug_fix
base_commit: b867cf8fe8afaf9e7a4e899f5a58fb6dfd6f7f45
---

# Rs-lint: Rust qualification fails on unformatted or clippy-warning Rust code: qualify.py rs runs cargo fmt --all -- --check and cargo clippy --all-targets --locked -- -D warnings in rs/ before the tests, so hosted CI catches what the rs verify lane catches

## Intent

rs-lint: Rust qualification fails on unformatted or clippy-warning Rust code: qualify.py rs runs cargo fmt --all -- --check and cargo clippy --all-targets --locked -- -D warnings in rs/ before the tests, so hosted CI catches what the rs verify lane catches

## Affected Canonical Specs

- `release`

## Acceptance Criteria

- qualify.py rs runs cargo fmt --all -- --check and cargo clippy --all-targets --locked -- -D warnings in rs/ after the lockfile is generated and before cargo test, records the rustfmt and clippy versions, and exits non-zero on a formatting diff or any clippy warning (a release test asserts both commands are in the rs lane, and a local probe with one unformatted line and one clippy warning each makes qualify.py rs fail); hosted Rust CI and the publish-crates qualification step therefore enforce formatting and lints with no workflow change; the current tree passes both.

## No-spec Rationale

Not applicable
