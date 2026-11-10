# Lesson bundle: 73-rust-creates-restores-and-validates-ed25519-algochat-accounts-from-the-same-algorand-25-word-phrase-as-typescript

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: 73: Rust creates, restores and validates Ed25519 AlgoChat accounts from the same Algorand 25-word phrase as TypeScript, checked against TypeScript-generated phrase vectors, and rejects every phrase that is not exactly 25 lowercase wordlist words separated by single spaces with a valid checksum
- **Kind**: Feature
- **Specs**: protocol
- **Paths**: rs/, ts/conformance/, ts/src/services/, CHANGELOG.md
- **Acceptance**: A new TypeScript-generated vector ts/conformance/vectors/07-mnemonic-accounts.json (made with algosdk 3.7.0 and mnemonic.service.ts from fixed synthetic test-only entropy, never by Rust) lists, per phrase, the phrase, its 32-byte entropy, Ed25519 public key and Algorand address, X25519 public key and ML-KEM-768 encapsulation key, plus the SHA-256 of the 2048-word list, and negative cases with the expected verdict: 24 words, 26 words ending in the right checksum, a bad checksum word, nonzero padding bits, an unknown word, uppercase, leading/trailing/double spaces, tab and newline separators, four-letter prefixes and the empty string. bun conformance/tools/verify.mjs recomputes every positive with TypeScript and checks that TypeScript rejects every negative. Rust exposes validate_mnemonic, an Ed25519 restore from a phrase and create-random returning the phrase and account, matches every 07 positive exactly, rejects every 07 negative with an error, round-trips a freshly generated account through its phrase, and its conformance test also checks the 01 accounts[].mnemonic and accounts[].algorandAddress fields, so the #73 PENDING entries are gone. No test or log prints a phrase or secret, and the Rust account types do not Debug-print secrets.

## Evidence

- Verification commit: `2ef89384bf74120cd6eb300e8d25b546f6df590c`
- Base commit: `6cfb970c9f7d2c326b5105698673b68afda430d6`
- Verified by: `specsync check --spec protocol`

## From the change's context.md

# Context

Raven Slice 1 creates and restores an account from an Algorand 25-word phrase and derives the encryption and ML-KEM-768 keys from it. Raven Desktop may not write its own mnemonic decoder, account generation or key derivation (algochat#73, CRATE-4, CRATE-6). Rust 0.6.0 has `derive_keys_from_seed`, `derive_mlkem768` and `AlgoChat::from_seed`, but no phrase-level create, restore or validate.

Decided at the scope gate: D4, AlgoChat implements Algorand phrase decoding itself (wordlist plus SHA-512/256 checksum), and does not depend on algonaut. Orc assignment: Ed25519 only, REQ-protocol-11 (#68 has REQ-protocol-12).

TypeScript 0.12.0 (`ts/src/services/mnemonic.service.ts`, algosdk 3.7.0):
- Encryption entropy is `algosdk.seedFromMnemonic(phrase)`, the 32-byte key, for both signing schemes. The X25519 keys and ML-KEM-768 keys come from that entropy.
- `createChatAccountFromMnemonic` defaults to Ed25519, so a classical phrase recovers the same address as Pera.
- `createRandomChatAccount` defaults to Falcon-1024. For the same words, the Falcon address differs from the Ed25519 address, while the encryption keys are the same.

Probed on 2026-11-05 with algosdk 3.7.0 and a synthetic key, printing verdicts only:
- `seedFromMnemonic` splits on a single space and does no trimming or case folding. Tabs, newlines, double, leading and trailing spaces, uppercase, prefixes, unknown words, 24 words, a bad checksum and nonzero padding bits are all rejected.
- **Defect:** it takes the first 24 words as the key and the *last* word as the checksum without checking the count. 26 or 30 words that end in the right checksum are accepted, recover the same key, and `validateMnemonic` returns true.

Ruled out:
- depending on algonaut (D4);
- Falcon in Rust (#69);
- trimming or normalizing input in the library. Apps may normalize what a user types, but the library accepts exactly algosdk's canonical form.

## From the change's design.md

# Design

## Rust (`rs/src/mnemonic.rs`, `rs/src/mnemonic_words.rs`)

- `MNEMONIC_WORDS: [&str; 2048]` in its own `.rs` file, since the crate ships only `src/*.rs`. A test checks its SHA-256, over the words joined with `\n`, against the value in vector 07.
- `mnemonic_to_entropy(phrase: &str) -> Result<Zeroizing<[u8; 32]>>`. It is strict and checks, in order:
  1. a split on `' '` gives exactly 25 parts;
  2. every part is in the list;
  3. the 24 indexes pack to 33 bytes with a zero last byte;
  4. word 25 equals the checksum word.

  Each failure is a distinct `AlgoChatError::InvalidMnemonic(reason)`. The reason never contains the phrase or a word.
- `entropy_to_mnemonic(entropy: &[u8; 32]) -> Zeroizing<String>`.
- `validate_mnemonic(phrase: &str) -> bool`.
- `Ed25519ChatAccount`. It holds:
  - the Algorand address;
  - the Ed25519 signing key;
  - the X25519 secret and public keys;
  - the ML-KEM-768 keys.

  `restore_ed25519_account(phrase)` builds it, and `create_random_ed25519_account()` returns `(Ed25519ChatAccount, Zeroizing<String>)` from `OsRng` entropy. `Debug` shows only the address and public keys. Secrets are zeroized on drop.
- The names say Ed25519 because the same words also restore a TypeScript Falcon-1024 account to a different address. The rustdoc says so, and points to #69.
- The new items are exported from `lib.rs` like the other modules. The existing `from_seed` path is unchanged.

## TypeScript

- `mnemonic.service.ts`: `mnemonicEntropy` and `validateMnemonic` first require exactly 25 parts from `split(' ')`, then call algosdk. This closes the over-long-phrase defect.
  - **Decision for Leif:** the recommended option is this TypeScript fix in the same change. The alternative is Rust-only strictness, with vector 07 recording the divergence. A TypeScript package release stays a separate decision either way.
- `conformance/tools/generate-mnemonic.mjs`, a new file, writes only `07-mnemonic-accounts.json`. Positives come from fixed synthetic entropy (all-zero, all-0xff, a counter pattern, and the 01 account A seed), using `algosdk.mnemonicFromSeed`, `createChatAccountFromMnemonic` and `deriveMLKEMKeyPair`. Each positive also records `falcon1024Address` for information. The negatives listed in change.md each carry `expect: "reject"`. The existing `generate.mjs` is not re-run, so the frozen 02/04/06 envelopes stay untouched.
- `verify.mjs` gains 07 checks: it recomputes every positive, requires TypeScript to reject every negative, and checks the wordlist hash.

## Vectors and tests

- `rs/vectors/07-mnemonic-accounts.json` is a byte-identical copy, enforced by `check_rust_vector_copies`.
- `rs/tests/conformance.rs` checks the exact 07 sections and cases and the 01 mnemonic and address fields. The `PENDING` list becomes empty, and a test asserts that.

## From the change's testing.md

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

## Where these lessons go

- `specs/protocol/context.md`
