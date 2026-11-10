---
change: 79-rs-readme-md-describes-the-packaged-crate-s-contents-the-way-70a-packages-it-req-release-3-library-sources-tests-rs
artifact: testing
---

# Testing

Docs only, so there is no product test. The checks are:

- `cargo package --list --allow-dirty --locked` in `rs/` lists exactly what the new sentence names: `src/*.rs` (no `src/bin/pqcross.rs`), `tests/conformance.rs` and `tests/cross_impl.rs`, twelve `vectors/*.json` copies, `README.md`, `LICENSE`, plus Cargo's generated files. There is no `examples/` entry.
- The new paragraph agrees with the Compatibility evidence and limits paragraph and with REQ-release-3.
- `fledge lanes run verify` and `fledge trust verify --range origin/main..HEAD` pass.
- Hosted: the PR's checks are green. A README-only change does not start the language lanes (REQ-release-1).

## Evidence

Local, 2026-11-10, macOS arm64, cargo 1.95.0.

- `cargo package --list --allow-dirty --locked` at 57d9354: 40 entries, matching the list above.
- `fledge lanes run verify`: validate passed; release unit tests 41 OK.
- `fledge trust verify --range origin/main..HEAD` at 57d9354: trust gate passed (augur proceed, risk 15; attest provenance degraded, as on earlier PRs).
