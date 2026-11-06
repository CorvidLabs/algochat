# Lesson bundle: 70a-rust-conformance-vectors-are-mandatory-and-self-contained-rust-verifies-the-typescript-generated-conformance

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: 70a: Rust conformance vectors are mandatory and self-contained: Rust verifies the TypeScript-generated conformance vectors and the shared vectors from files packaged in the crate, a missing vector or unhandled case fails, the silent sibling-directory tests are removed, and TypeScript CI runs its vector verifier
- **Kind**: Feature
- **Specs**: protocol, release
- **Paths**: rs/, scripts/release/, .github/workflows/ts.yml, ts/conformance/
- **Acceptance**: cargo test --locked passes both in rs/ and inside the unpacked algochat .crate, where tests/conformance.rs checks every section and case of the TypeScript-generated vectors 00-06 and the shared vectors from rs/vectors/ (byte-identical copies enforced by the release check), a missing vector file, a missing section or an unrecognized case makes the test fail, no Rust test returns early on a missing fixture, the sibling-directory cross_impl tests are gone, and the TypeScript qualification lane runs bun conformance/tools/verify.mjs.

## Evidence

- Verification commit: `33d92421d7a72f46e543a19de514db08c281daf0`
- Base commit: `8e54462c1e937572bd8ca5e7274620e139b00b8c`
- Verified by: `specsync check --spec protocol --spec release`

## From the change's context.md

# Context

Release B (algochat 0.7.0), item 1 of 4, under the scope Leif approved on 2026-11-05 ("Approve intent + A and B"). It covers part of algochat#70 (#70a). CRATE-3 says a missing vector fails the check. Today it doesn't:

- `rs/tests/cross_impl.rs` loads envelopes from `../test-envelopes-<impl>` or `../test-algochat/test-envelopes-<impl>`. These are sibling checkouts of the archived `test-algochat` repository, which this monorepo never has. Ten tests `return` when those directories are missing, and individual files are skipped with `continue`. A green `cargo test` therefore says nothing about interop. Release A's evidence (272 tests) carries that caveat.
- Rust unit tests in `src/group.rs`, `src/group_admin.rs` and `src/pq.rs` read `../vectors/*.json` from outside the crate. In the published `.crate` they don't compile or find their files, so the crate's tests can't run from the package.
- `ts/conformance/vectors/00-06` are deterministic vectors produced by the TypeScript reference generator, and `bun conformance/tools/verify.mjs` passes 85 checks locally. No CI lane runs that verifier, and Rust doesn't read those files.

Released 0.6.0 (tag v1.6.2) is unchanged by this change. Later Release B items (#73 phrase, #68 ACPQ, #70b Hybrid/0x02) add their vectors through the harness this change builds.

## From the change's design.md

# Design

- **`rs/vectors/`** holds byte-identical copies of the five `vectors/*.json` files and the seven `ts/conformance/vectors/0*.json` files, with the same file names in one flat directory. The sources stay canonical, and the copies are never edited by hand.
- **The release check** is `packages.check_rust_vector_copies(root)`. It returns one problem string per missing, extra or differing copy. `qualify.py rs` stops on any problem before running `cargo test`. The release unit tests cover the real repository plus three negative fixtures.
- **Package boundary (REQ-release-3):** `include` adds `/vectors/*.json` and `/tests/*.rs`. `validate_crate_boundary` also accepts `vectors/*.json` and `tests/*.rs`, and still rejects `src/bin/`, `examples/`, nested directories, workflows, agent and spec files.
- **Rust tests:**
  - `tests/conformance.rs` loads each file through one `vector(name)` helper rooted at `CARGO_MANIFEST_DIR/vectors`, which panics if the file is missing.
  - For each file it asserts the exact set of top-level sections.
  - Every array element must match a handler, and an unmatched element fails.
  - One `PENDING` list names the 01 `accounts[].mnemonic` check as `#73`.
- **Existing tests:**
  - Unit tests in `src/` switch from `../vectors` to `vectors/` inside the package. Only test modules change.
  - `tests/cross_impl.rs` loses its ten sibling-directory tests and their helpers, and keeps the four in-file known-answer tests.
- **TypeScript lane:** `qualify.py ts` runs `bun conformance/tools/verify.mjs` after `bun test`.
- **Packaged tests:** `qualify.py rs` runs `cargo test --locked` inside the extracted crate before the consumer smoke test, so the crate's own tests have to pass from the package.

## From the change's testing.md

# Testing

Plan:

| Requirement | Check |
| --- | --- |
| REQ-protocol-10 | `cargo test --locked --test conformance` in `rs/`. Mutation runs in a scratch copy that delete a vector file, drop a section and rename a 06 case must each fail. A release test scans Rust tests for a return on a missing path. |
| REQ-release-3 | `python3 -m unittest discover -s scripts/release -v`: vector-copy and boundary positives and negatives. `cargo package --list` shows only the allowed members. |
| REQ-release-1 | Clean-clone `qualify.py rs` (tests run inside the extracted crate) and `qualify.py ts` (`verify.mjs`: 85 checks), each exit 0. Hosted Release qualification on the PR. |

Repository gates: `fledge lanes run verify`, `specsync change check --commit` and `fledge trust verify`.

## Local evidence (macOS arm64, 2026-11-05)

- Test first: at `77cc02a` the new tests failed before implementation. Release tests: `Ran 40 tests`, `FAILED (failures=4, errors=7)`. `cargo test --test conformance`: 0 passed, 8 failed, each panicking on the missing required vector file.
- At `66b7715` (implementation), `python3 -m unittest discover -s scripts/release` ran 40 tests OK, and `fledge lanes run verify` passed (`validate`, `release_checks`).
- `python3 scripts/release/qualify.py rs OUT` in a clean `git clone --no-local` at `66b7715`: exit 0.
  - `cargo test --locked` in `rs/`: 258 unit, 8 conformance and 4 known-answer tests, all passing.
  - `cargo package --locked` built `algochat-0.6.0.crate` (sha256 `19497b5fe6cfb15da63b3ce5b40bd519fceb1e418cf63b315a1f016b9a8af588`, 40 members), and `validate_package` accepted it.
  - `cargo test --locked` inside the extracted crate: the same 258 + 8 + 4 passed.
  - The consumer ran.
- `python3 scripts/release/qualify.py ts OUT` in the same clean clone: exit 0. `bun conformance/tools/verify.mjs`: `85 checks passed, 0 failed`.
- Mutations of `rs/vectors/` made `cargo test --test conformance` fail once each (7 passed, 1 failed): deleting `05-psk-exchange.json`, dropping the `03` `hybridKeyVector` section, renaming a `06` case, adding an extra `02` section, changing the `02` captured plaintext, and deleting `group-v1.json`. The copies were restored and checked with `diff -r`.
- `git diff 8e54462 HEAD -- rs/src`: 5 changed lines, all inside `mod tests`.

Pending by design: the `01` `accounts[].mnemonic` and `accounts[].algorandAddress` fields (#73).

Not run here: the hosted Release qualification matrix, which runs on the PR.

## Where these lessons go

- `specs/protocol/context.md`
- `specs/release/context.md`
