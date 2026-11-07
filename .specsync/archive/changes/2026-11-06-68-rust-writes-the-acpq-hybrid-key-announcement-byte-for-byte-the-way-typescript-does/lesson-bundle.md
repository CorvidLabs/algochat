# Lesson bundle: 68-rust-writes-the-acpq-hybrid-key-announcement-byte-for-byte-the-way-typescript-does

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: 68: Rust writes the ACPQ Hybrid key announcement byte for byte the way TypeScript does
- **Kind**: Feature
- **Specs**: protocol
- **Paths**: rs/, vectors/pq-announcement-v1.json, ts/scripts/emit-pq-announcement-vector.ts, ts/src/pq/announce.test.ts, TEST-VECTORS.md
- **Acceptance**: cargo test --locked passes in rs/ and inside the unpacked algochat .crate, where tests/pq_announcement.rs shows that encode_pq_announcement and pq_announcement_signing_input reproduce the exact 1189-byte unsigned note, 1253-byte signed note and signing input of the TypeScript-generated vectors/pq-announcement-v1.json from its account seed, that every parse case gives the same unverified, verified or rejected result, and that a key that is not 1184 bytes is refused; bun test in ts/ shows the committed vector is exactly what ts/scripts/emit-pq-announcement-vector.ts writes and that every case holds in TypeScript; parse_pq_announcement results and the wire format do not change.

## Evidence

- Verification commit: `14250c5c7a6435eae491ad7633db0243242417b1`
- Base commit: `b867cf8fe8afaf9e7a4e899f5a58fb6dfd6f7f45`
- Verified by: `specsync check --spec protocol`

## From the change's context.md

# Context

Release B (algochat 0.7.0), the #68 row, under the scope Leif approved on 2026-11-05 ("Approve intent + A and B"). It serves CRATE-5: "I can publish my Hybrid key from Rust the same way Raven web does, signed or unsigned, without building the note myself." Raven Slice 1 needs it for Hybrid first contact.

- TypeScript 0.12.0 writes the `ACPQ` note with `encodePQKeyAnnouncement` and exports `pqAnnouncementSigningInput` (`ts/src/pq/announce.ts`). Rust 0.6.0 only reads it: `parse_pq_announcement` in `rs/src/pq.rs`. Raven Desktop can't publish its key without building the note and the signature itself, which CRATE-6 forbids.
- The wire format is already fixed in PROTOCOL.md section 5.7: magic `ACPQ` (4), version `0x01` (1), encapsulation key (1184), optional Ed25519 signature (64). The note is 1189 bytes unsigned and 1253 signed. The signature is over SHA-256 of `AlgoChat-pq-ek-v1`, the version byte and the key. Nothing here changes it.
- No shared vector covers the announcement yet. Rust's only check is a hand-built signed note inside `rs/src/pq.rs` tests.
- #70a (PR #75, not yet merged) adds `rs/vectors/`, byte-identical copies that the release check enforces, and the `SHARED` list in `rs/tests/conformance.rs`. This branch is built on #75's head (`b867cf8`), as the orchestrator agreed, and merges `origin/main` once #75 lands. This change adds its vector through that harness. #73 (25-word phrase) runs in parallel under REQ-protocol-11; this change uses REQ-protocol-12, as the orchestrator assigned.

## From the change's design.md

# Design

- **Rust API** (`rs/src/pq.rs`, re-exported from the crate root like the rest of `pq`):
  - `pq_announcement_signing_input(encaps_key: &[u8]) -> Result<[u8; 32]>`: SHA-256 of `AlgoChat-pq-ek-v1`, `0x01` and the key. A key that is not 1184 bytes is `AlgoChatError::InvalidPublicKey`.
  - `encode_pq_announcement(encaps_key: &[u8], signing_key: Option<&SigningKey>) -> Result<Vec<u8>>`: `ACPQ`, `0x01`, the key and, with a signing key, the Ed25519 signature over the signing input. Same length error.
  - `parse_pq_announcement` uses the same constants and signing input. Its results don't change.
  - The signature comes from `ed25519-dalek`, already a dependency. No new dependency.
- **Vector** `vectors/pq-announcement-v1.json`, written by `ts/scripts/emit-pq-announcement-vector.ts` (run from `ts/`, optional output path):
  - Inputs: `account_seed` (32 × `0x22`), from which the ML-KEM-768 key is derived; the Ed25519 signer is the same seed. `other_signer_seed` (32 × `0x11`) is the wrong signer.
  - Outputs: `encaps_key`, `ed25519_public_key`, `other_signer_public_key`, `signing_input`, `unsigned_note`, `signed_note`, sizes, label and version.
  - `parse_cases`: 17 cases of `name`, `note`, `verifying_key` (or null), `is_announcement` and `expect` (`unverified`, `verified` or `rejected`). Accepted cases return `encaps_key`. The cases cover the unsigned note with and without a key, the signed note with the signer's key, without a key and with another signer's key, a changed key byte, signature byte or version, a zero signature appended, magic `ACPR`, the unsigned and signed lengths ±1, magic only and empty.
  - `bad_encaps_key_lengths`: 0, 1183 and 1185. Encoding, unsigned and signed, and the signing input refuse each.
  - The emitter computes each result with the TypeScript parser and throws if one differs from the intended result.
- **Checks**:
  - `ts/src/pq/announce.test.ts` runs the emitter into a temporary file and requires the committed file to match byte for byte; the failure names the regenerate command. It then checks every field and case with the TypeScript functions.
  - `rs/tests/pq_announcement.rs` reads `rs/vectors/pq-announcement-v1.json` through the crate's public API: the notes from the seed through `derive_mlkem768`, the signing input, round trips, every parse case and every bad length. An unknown field, an unknown result or a missing file fails.
  - `pq-announcement-v1.json` joins `SHARED` in `rs/tests/conformance.rs`. The #70a release check then requires `rs/vectors/` to hold an exact copy.

## From the change's testing.md

# Testing

Plan:

| Requirement | Check |
| --- | --- |
| REQ-protocol-12 | `bun test src/pq/announce.test.ts` in `ts/`: the committed vector equals the emitter's output (the test runs the regenerate command), and every field and case holds. `cargo test --locked --test pq_announcement` in `rs/` and inside the extracted crate: exact notes and signing input from the seed, round trips, every parse case, every bad length. |
| REQ-protocol-12 (mutations) | In a scratch copy, each of these must fail the Rust test: one byte of `signed_note`, `unsigned_note` or `signing_input` changed, one case's `expect` changed, a case field renamed, a new top-level field, and the file deleted. Changing `vectors/pq-announcement-v1.json` alone must fail the TypeScript test with the regenerate command in its message. Applied to the Rust encoder, a dropped version byte and a signature over the unhashed message must each fail. |
| REQ-protocol-12 (no regression) | Full `cargo test --locked` in `rs/` (including `src/pq.rs` `parity_fixture` and the conformance tests), full `bun test` and `tsc` in `ts/`. |
| REQ-protocol-10, REQ-release-3 | `python3 -m unittest discover -s scripts/release -v`: the copy check accepts the new `rs/vectors/` file. Clean-clone `qualify.py rs` (tests inside the extracted crate) and `qualify.py ts`, each exit 0. |

Repository gates: `fledge lanes run verify`, `specsync change check --commit` and `fledge trust verify`. The hosted Release qualification matrix runs on the PR because `vectors/` changes.

Before the change, the tests must fail at the test-only commit: the TypeScript test because the vector file is missing, and the Rust test because `encode_pq_announcement` and `pq_announcement_signing_input` don't exist. Both failures are recorded with that commit.

## Local evidence (macOS arm64, 2026-11-06)

- Test first: at `e2b8473` the new tests failed before the implementation.
  - `cargo test --locked --test pq_announcement` did not compile: `E0432` unresolved imports `encode_pq_announcement` and `pq_announcement_signing_input`.
  - `cargo test --locked --test conformance`: 7 passed, 1 failed. `every_vector_file_is_present` panicked because `rs/vectors/pq-announcement-v1.json` was missing.
  - `bun test src/pq/announce.test.ts`: `vectors/pq-announcement-v1.json is missing ...; write it with: cd ts && bun scripts/emit-pq-announcement-vector.ts && cp ../vectors/pq-announcement-v1.json ../rs/vectors/`.
- Implementation at `effbbd5`, docs at `c0fbac2`. In the worktree:
  - `cargo test --locked` in `rs/`: 258 unit, 8 conformance, 4 known-answer and 4 `pq_announcement` tests passed.
  - `cargo fmt --check` and `cargo clippy --locked --all-targets -- -D warnings` were clean.
  - `bun test` in `ts/`: 317 pass, 0 fail. `tsc --noEmit` was clean.
  - `python3 -m unittest discover -s scripts/release`: 40 tests OK. `fledge lanes run verify` passed (2 steps).
- The emitter wrote the same bytes as the scratch spike from the night before, and `rs/vectors/pq-announcement-v1.json` is a byte copy.
- `python3 scripts/release/qualify.py rs OUT` in a clean `git clone --no-local` at `c0fbac2`: exit 0.
  - `cargo test --locked` in `rs/` and again inside the extracted crate: 258 + 8 + 4 + 4 passed both times.
  - `cargo package --locked` built `algochat-0.6.0.crate` with 42 members (the 40 before, plus `tests/pq_announcement.rs` and `vectors/pq-announcement-v1.json`), sha256 `9332b889cd7eda7caa2970f13b76df47a625cfe8d4fb4961896f02b367da71b3`.
  - The consumer ran.
- `python3 scripts/release/qualify.py ts OUT` in the same clean clone: exit 0. `bun test` gave 317 pass and `verify.mjs` gave 85 checks passed, 0 failed.
- Mutations in a scratch clone at `c0fbac2` (each reverted with `git checkout`, and the tree was clean after the last one). Each of the following made `cargo test --locked --test pq_announcement` fail:
  - one byte of `signed_note`, `unsigned_note` or `signing_input` changed;
  - parse case 2's `expect` changed to `unverified`;
  - a case field renamed;
  - a new top-level field;
  - `rs/vectors/pq-announcement-v1.json` deleted;
  - the encoder without the version byte;
  - the encoder signing the unhashed message instead of the digest.
- Changing one byte of `vectors/pq-announcement-v1.json` alone made `bun test src/pq/announce.test.ts` fail, and the message named the regenerate command.
- `git diff b867cf8 HEAD -- rs/src`: only `rs/src/pq.rs` (51 insertions, 13 deletions). `parse_pq_announcement` now uses the shared constants and `pq_announcement_signing_input`, and every parse case result is unchanged.
- `fledge trust verify` on the worktree: `augur gate · proceed (risk 34)` and `trust gate passed (progressive provenance)`. Provenance is reported degraded (`policy is not satisfied`) because nothing is attested before review.

Not run here: the hosted Release qualification matrix, which runs on the PR.

## Where these lessons go

- `specs/protocol/context.md`
