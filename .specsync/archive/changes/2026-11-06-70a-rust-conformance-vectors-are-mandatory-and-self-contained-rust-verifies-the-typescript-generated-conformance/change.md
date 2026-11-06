---
id: 70a-rust-conformance-vectors-are-mandatory-and-self-contained-rust-verifies-the-typescript-generated-conformance
state: archived
type: feature
base_commit: 8e54462c1e937572bd8ca5e7274620e139b00b8c
---

# 70a: Rust conformance vectors are mandatory and self-contained: Rust verifies the TypeScript-generated conformance vectors and the shared vectors from files packaged in the crate, a missing vector or unhandled case fails, the silent sibling-directory tests are removed, and TypeScript CI runs its vector verifier

## Intent

70a: Rust conformance vectors are mandatory and self-contained: Rust verifies the TypeScript-generated conformance vectors and the shared vectors from files packaged in the crate, a missing vector or unhandled case fails, the silent sibling-directory tests are removed, and TypeScript CI runs its vector verifier

## Affected Canonical Specs

- `protocol`
- `release`

## Acceptance Criteria

- cargo test --locked passes both in rs/ and inside the unpacked algochat .crate, where tests/conformance.rs checks every section and case of the TypeScript-generated vectors 00-06 and the shared vectors from rs/vectors/ (byte-identical copies enforced by the release check), a missing vector file, a missing section or an unrecognized case makes the test fail, no Rust test returns early on a missing fixture, the sibling-directory cross_impl tests are gone, and the TypeScript qualification lane runs bun conformance/tools/verify.mjs.

## No-spec Rationale

Not applicable
