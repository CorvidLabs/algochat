# Lesson bundle: 79-rs-readme-md-describes-the-packaged-crate-s-contents-the-way-70a-packages-it-req-release-3-library-sources-tests-rs

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: 79: rs/README.md describes the packaged crate's contents the way #70a packages it (REQ-release-3): library sources, tests/*.rs, the vectors/ copies, README and license; the example and pqcross stay in the checkout; 0.6.0 predates this
- **Kind**: BugFix
- **Paths**: rs/README.md
- **Acceptance**: rs/README.md's install section says the packaged crate contains the library sources, tests/*.rs, the vectors/ copies those tests read, the README and the license, so cargo test runs from the package; the export_envelopes example and the pqcross binary stay in the repository; it notes that the 0.6.0 crates.io release predates this. The sentence agrees with the README's Compatibility evidence section and with cargo package --list (src/*.rs, tests/*.rs, vectors/*.json, README.md, LICENSE; no src/bin or examples). No code, packaging, spec or requirement changes.

## Evidence

- Verification commit: `65b339ee9c7f0418b336da964eda6270585b92dc`
- Base commit: `57d93540de958014771c0a6cfcbf16e37554bc88`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

Issue #79. `rs/README.md` line 40 (install section) said the published crate contains only the library sources, the README and the license, and that the tests read the shared `../vectors/` files from a checkout. That was true for 0.6.0 (Release A, #67). #70a (PR #75, merged as 45e3d35) made the crate ship `tests/*.rs` and byte-identical `vectors/*.json` copies the tests read from inside the package (REQ-release-3, `rs/Cargo.toml` `include`), and qualification runs `cargo test --locked` inside the extracted crate. The README's later paragraph (Compatibility evidence and limits) already said so, so the two contradicted each other. Found while building #68 (PR #77) and #70b (PR #78).

This is a bug fix under Leif's merge rule of 2026-11-10 (passed on by the coordinator, hc terminal t370): work that makes behaviour or docs match existing specs, requirements or HI may run the full SpecSync lifecycle with 0xLeif as approve and review actor, and squash-merge once CI is green and every review thread is resolved. The sentence now matches REQ-release-3 as already approved; no requirement, contract, code or packaging changes.

The 0.6.0 crate on crates.io still lacks the tests and vectors, and the README's install line still shows `algochat = "0.6.0"`, so the new wording says that 0.6.0 predates the change rather than claiming the published 0.6.0 crate holds tests.

## From the change's testing.md

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

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
