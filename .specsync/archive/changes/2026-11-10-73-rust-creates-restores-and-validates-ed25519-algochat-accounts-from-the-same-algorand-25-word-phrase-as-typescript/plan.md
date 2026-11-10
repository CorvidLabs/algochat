---
change: 73-rust-creates-restores-and-validates-ed25519-algochat-accounts-from-the-same-algorand-25-word-phrase-as-typescript
artifact: plan
---

# Plan

## Approach

Generate the phrase vectors in TypeScript first, then write failing Rust conformance tests and failing TypeScript tests for the over-long-phrase defect. After that, implement the Rust module and the TypeScript length check.

## Out of scope

- Falcon-1024 accounts in Rust (#69).
- ACPQ (#68) and Hybrid vectors (#70b), both with ac-acpq.
- Normalizing user input.
- Any tag, publish or TypeScript package release.
- Re-running `generate.mjs`.

## Steps

1. `generate-mnemonic.mjs` writes `07-mnemonic-accounts.json`; `verify.mjs` checks it. The over-long negatives fail `verify.mjs` until the TypeScript fix lands, which is the red step for TypeScript.
2. A failing TypeScript test for the 26- and 30-word phrases in `mnemonic.service.test.ts`.
3. Copy 07 to `rs/vectors/`. Write a failing `rs/tests/conformance.rs` covering 07 and the 01 mnemonic and address fields, with `PENDING` emptied.
4. Implement `rs/src/mnemonic.rs` and `mnemonic_words.rs`, and export them. Add unit tests: round trip, each error kind, and `Debug` redaction.
5. Fix `mnemonic.service.ts`.
6. Update specs, `rs/README.md`, `ts/conformance/README.md` and `CHANGELOG.md`.
7. Run the release tests and clean-clone `qualify.py rs` and `ts`, plus negative probes: mutate an expected address, delete a negative case, and remove the length check. Then `fledge lanes run verify` and `fledge trust verify`, and record evidence.

## Risks

- A wrong wordlist or checksum would send funds to the wrong wallet. The defences are the wordlist hash, vectors from algosdk, and the 01 account A cross-check.
- Tightening TypeScript rejects over-long phrases it accepted before. It is still a fix: such a phrase was never a canonical Algorand phrase.
- A Falcon phrase restored in Rust gives the Ed25519 address. The format can't be told apart, so the explicit `ed25519` naming and the docs are what keep that visible.

## Constraints consulted

- REQ-protocol-10: vectors come from TypeScript, never from Rust.
- REQ-release-3: byte-identical copies, and only `src/*.rs`.
- D4: no algonaut.
- "Never print real mnemonics or keys": synthetic test-only entropy, and no phrase in any output.
