---
change: 73-rust-creates-restores-and-validates-ed25519-algochat-accounts-from-the-same-algorand-25-word-phrase-as-typescript
artifact: context
---

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
