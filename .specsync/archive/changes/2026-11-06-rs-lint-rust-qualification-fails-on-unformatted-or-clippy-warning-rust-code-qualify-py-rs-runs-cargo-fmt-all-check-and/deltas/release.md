## Modified

### REQUIREMENT REQ-release-1

Qualification SHALL run each existing language test lane plus safe build/package validation for TypeScript, Swift, Python, Rust, Kotlin and Go. Rust qualification SHALL run `cargo fmt --all -- --check` and `cargo clippy --all-targets --locked -- -D warnings` in `rs/` before its tests, and `cargo test --locked` inside the extracted crate. TypeScript qualification SHALL run `bun conformance/tools/verify.mjs`.

#### Acceptance Criteria

- a change to one language tree runs that language on the PR head and preserves its evidence
- a change to the protocol, vectors, or release scripts runs all six, plus Swift Linux, on that same head
- a README, docs, or intent-only change does not start those lanes
- the Rust lane fails when a test fails inside the extracted crate, and the TypeScript lane fails when the vector verifier fails
- the Rust lane fails on a rustfmt diff or any clippy warning in library, test or example code
