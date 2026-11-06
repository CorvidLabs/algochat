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

Pending.
