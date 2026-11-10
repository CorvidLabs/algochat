---
change: 73-rust-creates-restores-and-validates-ed25519-algochat-accounts-from-the-same-algorand-25-word-phrase-as-typescript
artifact: docs
---

# Docs

- `rs/README.md`: an accounts section covering:
  - `validate_mnemonic`, `restore_ed25519_account` and `create_random_ed25519_account`;
  - strict input rules;
  - Ed25519 only;
  - a Falcon phrase from TypeScript restores to a different address but the same encryption keys.
- `ts/conformance/README.md`: vector 07 and `generate-mnemonic.mjs`.
- `CHANGELOG.md` Unreleased:
  - Rust phrase accounts (#73);
  - TypeScript rejects phrases with more than 25 words.
- `specs/protocol/protocol.spec.md`: vector 07 and REQ-protocol-11.
