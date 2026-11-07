---
change: 70b-rust-reads-a-long-two-way-hybrid-conversation-and-kept-extra-lock-notes-that-typescript-wrote
artifact: plan
---

# Plan

## Approach

Prove with two shared vectors, written by TypeScript and read by both languages, that Rust reads what Raven web writes: a long two-way Hybrid conversation and kept Extra lock notes, with their counter window across a restart. The tests are written, committed and seen to fail before the vectors exist. No library code changes.

## Decisions for approval

- **Account seeds rather than 25-word phrases.** The scope says "phrase-derived keys". The accounts use the seeds of `01-key-derivation.json`; #73's `07-mnemonic-accounts.json` proves phrase to seed. Rejected: putting phrases in this vector, which would make #70b wait for #73's Rust API.
- **Seeded randomness in the emitter.** It makes the files reproducible, so a test can regenerate and compare them. Rejected: frozen random output, which no test can regenerate; building envelopes in the emitter, which would test the emitter instead of the library.
- **Version `0x02` Extra lock notes only.** TypeScript 0.12.0 has no version `0x01` writer, and the emitter must not build envelopes by hand.

## Out of scope

- Proof that Raven Desktop never writes `0x02` notes. That is Raven Desktop's policy, tested there.
- TypeScript reading Rust-written notes. That is the `pqcross` LocalNet mesh (`ts/scripts/pq-cross-localnet.ts`).
- Rooms, Raven payloads and LocalNet exchanges (#70c, #70d); 25-word phrases (#73); the ACPQ write path (#68).
- Library code in TypeScript or Rust, and any wire-format or protocol-version change.
- Checking these vectors in Go, Python, Kotlin or Swift.
- Any version bump, tag or publish.

## Steps

1. Write the failing tests: `ts/src/pq/conversation.test.ts`, `ts/src/psk/kept.test.ts`, `rs/tests/pq_conversation.rs`, `rs/tests/psk_kept.rs` and the two `SHARED` entries. Commit them and record that they fail because the vector files are missing.
2. Add `ts/scripts/emit-conversation-vectors.ts`, write both files with it, and copy them to `rs/vectors/`.
3. Update TEST-VECTORS.md, `specs/protocol`, `rs/README.md` and `CHANGELOG.md` (Unreleased).
4. Run `bun test` and `tsc` in `ts/`; `cargo fmt --check`, `cargo clippy --all-targets -D warnings` and `cargo test --locked` in `rs/`; the release tests; clean-clone `qualify.py rs` and `qualify.py ts`; and the mutation runs. Then `fledge lanes run verify` and `fledge trust verify`, and record the evidence.

Relative size: medium; the emitter and four tests, no library code. The main uncertainty is merging with #73 and #68, which edit `rs/tests/conformance.rs`, `specs/protocol`, TEST-VECTORS.md and `CHANGELOG.md` at the same time.

## Risks

- The seeded stream depends on how many random bytes the library draws and in what order. A dependency update that changes that fails the TypeScript test with the regenerate command. A regenerated file is a reviewed change to both copies.
- If Rust and TypeScript disagree on a note or a counter step, that is an interop bug. It gets its own bug and a fix, never an edited vector.
- Merge conflicts in shared files. Merge `origin/main` before the PR and again before merge.

## Constraints consulted

- CRATE-2 and CRATE-3 (a missing vector fails).
- REQ-protocol-10 and REQ-release-3 from #70a: byte-identical copies in `rs/vectors/`, and the crate's tests run from the package.
- #70a lessons: vectors come only from TypeScript, never from Rust; `ts/conformance/tools/generate.mjs` is not rerun.
- `specs/release/context.md`: a vector change runs the full qualification matrix.
- No reimplemented crypto: the stream uses `@noble/hashes` SHA-256 in a test script, and every note comes from the library.
