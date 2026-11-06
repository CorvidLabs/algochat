---
change: 70a-rust-conformance-vectors-are-mandatory-and-self-contained-rust-verifies-the-typescript-generated-conformance
artifact: context
---

# Context

Release B (algochat 0.7.0), item 1 of 4, under the scope Leif approved on 2026-11-05 ("Approve intent + A and B"). It covers part of algochat#70 (#70a). CRATE-3 says a missing vector fails the check. Today it doesn't:

- `rs/tests/cross_impl.rs` loads envelopes from `../test-envelopes-<impl>` or `../test-algochat/test-envelopes-<impl>`. These are sibling checkouts of the archived `test-algochat` repository, which this monorepo never has. Ten tests `return` when those directories are missing, and individual files are skipped with `continue`. A green `cargo test` therefore says nothing about interop. Release A's evidence (272 tests) carries that caveat.
- Rust unit tests in `src/group.rs`, `src/group_admin.rs` and `src/pq.rs` read `../vectors/*.json` from outside the crate. In the published `.crate` they don't compile or find their files, so the crate's tests can't run from the package.
- `ts/conformance/vectors/00-06` are deterministic vectors produced by the TypeScript reference generator, and `bun conformance/tools/verify.mjs` passes 85 checks locally. No CI lane runs that verifier, and Rust doesn't read those files.

Released 0.6.0 (tag v1.6.2) is unchanged by this change. Later Release B items (#73 phrase, #68 ACPQ, #70b Hybrid/0x02) add their vectors through the harness this change builds.
