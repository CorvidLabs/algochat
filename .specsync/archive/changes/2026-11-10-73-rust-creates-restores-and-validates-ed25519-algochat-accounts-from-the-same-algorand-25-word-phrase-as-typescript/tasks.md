---
change: 73-rust-creates-restores-and-validates-ed25519-algochat-accounts-from-the-same-algorand-25-word-phrase-as-typescript
artifact: tasks
---

# Tasks

- [x] Add `ts/conformance/tools/generate-mnemonic.mjs` and generate `07-mnemonic-accounts.json`; extend `verify.mjs` (red until the TypeScript fix).
- [x] Add the failing TypeScript test for 26- and 30-word phrases.
- [x] Copy 07 to `rs/vectors/`; add the failing Rust conformance checks for 07 and the 01 mnemonic and address fields; empty `PENDING`.
- [x] Implement `rs/src/mnemonic.rs` and `rs/src/mnemonic_words.rs` with unit tests, and export them.
- [x] Fix the 25-word check in `mnemonic.service.ts`.
- [x] Update `specs/protocol`, `rs/README.md`, `ts/conformance/README.md` and `CHANGELOG.md`.
- [x] Run the release tests, clean-clone `qualify.py rs` and `ts`, the negative probes, `fledge lanes run verify` and `fledge trust verify`, and record the evidence.
- [x] Open the PR without merging (opened after this check; merged only on the gates).
