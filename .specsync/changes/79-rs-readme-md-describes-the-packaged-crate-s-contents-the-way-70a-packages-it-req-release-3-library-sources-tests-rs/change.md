---
id: 79-rs-readme-md-describes-the-packaged-crate-s-contents-the-way-70a-packages-it-req-release-3-library-sources-tests-rs
state: approved
type: bug_fix
base_commit: 57d93540de958014771c0a6cfcbf16e37554bc88
---

# 79: rs/README.md describes the packaged crate's contents the way #70a packages it (REQ-release-3): library sources, tests/*.rs, the vectors/ copies, README and license; the example and pqcross stay in the checkout; 0.6.0 predates this

## Intent

79: rs/README.md describes the packaged crate's contents the way #70a packages it (REQ-release-3): library sources, tests/*.rs, the vectors/ copies, README and license; the example and pqcross stay in the checkout; 0.6.0 predates this

## Affected Canonical Specs

- None

## Acceptance Criteria

- rs/README.md's install section says the packaged crate contains the library sources, tests/*.rs, the vectors/ copies those tests read, the README and the license, so cargo test runs from the package; the export_envelopes example and the pqcross binary stay in the repository; it notes that the 0.6.0 crates.io release predates this. The sentence agrees with the README's Compatibility evidence section and with cargo package --list (src/*.rs, tests/*.rs, vectors/*.json, README.md, LICENSE; no src/bin or examples). No code, packaging, spec or requirement changes.

## No-spec Rationale

Docs-only correction: rs/README.md is brought in line with REQ-release-3 as already approved and implemented by #70a; no requirement, contract or code changes
