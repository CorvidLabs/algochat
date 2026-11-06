---
change: 70a-rust-conformance-vectors-are-mandatory-and-self-contained-rust-verifies-the-typescript-generated-conformance
artifact: testing
---

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
