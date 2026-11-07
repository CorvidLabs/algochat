---
change: 68-rust-writes-the-acpq-hybrid-key-announcement-byte-for-byte-the-way-typescript-does
artifact: plan
---

# Plan

## Approach

Give Rust the ACPQ write path TypeScript already has, and prove it with one shared vector that TypeScript writes and both languages check. The tests are written, committed and seen to fail before the vector or the Rust code exist.

## Out of scope

- Any wire-format, protocol-version or parsing change.
- Discovering, choosing or trusting announcements (the application's policy, SECURITY.md item 12).
- TypeScript library code (`ts/src` outside the new test).
- Checking the vector in Go, Python, Kotlin or Swift.
- #73 (25-word phrase, REQ-protocol-11), #70b and later rows.
- Any version bump, tag or publish.

## Steps

1. Write the failing tests: `ts/src/pq/announce.test.ts`, `rs/tests/pq_announcement.rs`, and the `SHARED` entry in `rs/tests/conformance.rs`. Commit them and record that they fail: the vector file is missing, and the Rust functions don't exist yet.
2. Add `ts/scripts/emit-pq-announcement-vector.ts`, write `vectors/pq-announcement-v1.json` with it, and copy the file to `rs/vectors/`.
3. Add `encode_pq_announcement` and `pq_announcement_signing_input` to `rs/src/pq.rs`, and make `parse_pq_announcement` share their constants.
4. Update TEST-VECTORS.md, `specs/protocol`, `rs/specs/protocol/protocol.spec.md`, `rs/README.md` and `CHANGELOG.md` (Unreleased).
5. Run `bun test` and `tsc` in `ts/`; `cargo fmt` on the new Rust code, `cargo clippy -D warnings` and `cargo test --locked` in `rs/`; the release tests; clean-clone `qualify.py rs` and `qualify.py ts`; and mutation runs. Then `fledge lanes run verify` and `fledge trust verify`, and record the evidence.

Relative size: small. History is too thin for a time range (one recorded cycle). The main uncertainty is merging with #73, which edits `rs/tests/conformance.rs`, `specs/protocol` and `CHANGELOG.md` at the same time.

## Risks

- If Rust and TypeScript disagree on a byte, that is an interop bug. It gets its own bug and a fix, never an edited vector.
- An exact duplicate of a parse result in two languages could hide a shared mistake. The cases follow PROTOCOL.md section 5.7 and the existing TypeScript tests, not the Rust code.
- Merge conflicts with #73 in shared files. Merge `origin/main` before the PR and again before merge.

## Constraints consulted

- CRATE-5 and CRATE-6; CRATE-3 (a missing vector fails).
- REQ-protocol-10 and REQ-release-3 from #70a: vectors are byte-identical copies in `rs/vectors/`, and the crate's tests run from the package.
- `specs/release/context.md`: a vector change runs the full qualification matrix.
- No reimplemented crypto: Ed25519 from `ed25519-dalek`, SHA-256 from `sha2`, and ML-KEM from `ml-kem`, all released crates already in the dependency list.
