## Modified

### REQUIREMENT REQ-release-1

Qualification SHALL run each existing language test lane plus safe build/package validation for TypeScript, Swift, Python, Rust, Kotlin and Go. Rust qualification SHALL also run `cargo test --locked` inside the extracted crate, and TypeScript qualification SHALL run `bun conformance/tools/verify.mjs`.

#### Acceptance Criteria

- a change to one language tree runs that language on the PR head and preserves its evidence
- a change to the protocol, vectors, or release scripts runs all six, plus Swift Linux, on that same head
- a README, docs, or intent-only change does not start those lanes
- the Rust lane fails when a test fails inside the extracted crate, and the TypeScript lane fails when the vector verifier fails

### REQUIREMENT REQ-release-3

Artifact validation SHALL reject missing expected package files, incorrect package identities and malformed archives. The Rust crate SHALL contain only its manifest, `Cargo.toml.orig`, `Cargo.lock`, `.cargo_vcs_info.json`, `README.md`, `LICENSE`, `src/*.rs` library sources, `tests/*.rs` integration tests and `vectors/*.json` vector copies, and its manifest SHALL name `https://github.com/CorvidLabs/algochat` as its repository. Each file in `rs/vectors/` SHALL be byte-identical to its canonical source in `vectors/` or `ts/conformance/vectors/`, and every canonical source Rust reads SHALL have a copy.

#### Acceptance Criteria

- positive and negative fixtures exercise those failures and CI inspects real artifacts.
- a Rust crate with a binary source, example, nested test or source directory, workflow, agent or spec file, or with the archived `rs-algochat` repository URL, is rejected.
- a missing, extra or differing `rs/vectors/` copy is rejected before Rust tests run.
