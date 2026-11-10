---
change: 73-rust-creates-restores-and-validates-ed25519-algochat-accounts-from-the-same-algorand-25-word-phrase-as-typescript
artifact: design
---

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
