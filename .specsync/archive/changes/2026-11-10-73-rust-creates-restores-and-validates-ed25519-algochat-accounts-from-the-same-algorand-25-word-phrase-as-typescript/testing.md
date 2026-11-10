---
change: 73-rust-creates-restores-and-validates-ed25519-algochat-accounts-from-the-same-algorand-25-word-phrase-as-typescript
artifact: testing
---

# Testing

- **Red first:**
  - `verify.mjs` fails on the 07 over-long negatives;
  - the new TypeScript test fails;
  - `cargo test --test conformance` fails on 07 and the 01 fields;
  - the release tests fail if the 07 copy is missing.
- **Green:**
  - `bun test` and `bun conformance/tools/verify.mjs` pass;
  - `cargo test` passes in `rs/` and inside the extracted crate (via `qualify.py rs`), with rustfmt and clippy passing (rs-lint);
  - the release tests pass.
- **Probes:** each of these makes the relevant check fail:
  - change one expected address in the `rs/vectors` copy (the copy check fails first; with both copies changed, Rust conformance fails);
  - drop one negative case;
  - remove the Rust 25-part check;
  - remove the TypeScript length check.
- **No secrets in output:** run tests with `--nocapture` and grep the output for every vector phrase's first three words; expect no hits.
- `fledge lanes run verify` (rs) and `fledge trust verify` pass. Hosted checks run on the PR head.

## Evidence

Local, 2026-11-06, macOS arm64, rustc/cargo 1.95.0, rustfmt 1.9.0, clippy 0.1.95, Bun with algosdk 3.7.0.

- **Vector generation:** `generate-mnemonic.mjs` writes `07-mnemonic-accounts.json` byte-identically on a second run (sha256 f08f532b...). Its `counter-00` phrase, entropy, address, Ed25519 and X25519 keys equal the 01 account A values. The wordlist equals BIP-39 `english.txt` (sha256 2f5eed53...).
- **Red, at `51731b4`:**
  - `verify.mjs`: 131 passed, 2 failed (the 26- and 30-word negatives).
  - The new TypeScript test failed.
  - `cargo test --test conformance` did not compile (no phrase API).
- **Green, at `4bf64f3`:**
  - `cargo test`: 261 unit, 11 conformance and 4 cross_impl tests.
  - `cargo fmt --check` and `cargo clippy --all-targets -D warnings` are clean.
  - `bun test`: 314 of 314. `verify.mjs`: 133 of 133.
  - Release tests OK. `specsync check --force`: 3 passed.
- **Clean clone at `4bf64f3`:**
  - `qualify.py rs` exits 0. The same 261/11/4 pass in `rs/` and inside the extracted crate.
  - `qualify.py ts` exits 0: 314 tests, 133 vector checks.
- **Probes, each in a scratch clone:**
  1. One copy's address changed: the copy check reports the stale copy. Both copies changed: `mnemonic_accounts_07` fails.
  2. A negative case dropped: `mnemonic_accounts_07` fails on the case set.
  3. The Rust 25-word check removed, algosdk-style: `mnemonic_accounts_07` fails on the over-long negatives.
  4. The TypeScript length check removed: `verify.mjs` reports 131/2 and `bun test` 1 failure.
- **No secrets in output:** the first three words of every 07 and 01 phrase appear 0 times in the `cargo test --nocapture`, `bun test`, `verify.mjs`, generator and both qualification logs.
- **Lanes:** `fledge lanes run verify` (rs) exits 0. `fledge trust verify --range origin/main..HEAD`: augur review (risk 37), trust gate passed (progressive provenance).
- **Known unrelated flake:** `room administration > a full-list note of 256 members...` in `ts/src/pq/group-admin.test.ts` sometimes passes the 5 s default timeout under a full `bun test`. It timed out once on origin/main as well, so it is not caused by this change.
- **Hosted:** pending the PR.
