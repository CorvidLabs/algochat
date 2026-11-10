---
change: 68-rust-writes-the-acpq-hybrid-key-announcement-byte-for-byte-the-way-typescript-does
artifact: testing
---

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
