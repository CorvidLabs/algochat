---
change: 73-rust-creates-restores-and-validates-ed25519-algochat-accounts-from-the-same-algorand-25-word-phrase-as-typescript
artifact: research
---

# Research

- **Algorand phrase format:**
  - The 32-byte key is split into 24 11-bit word indexes; the last word holds 3 key bits and 8 zero padding bits.
  - Word 25 is the word at the first 11 bits of SHA-512/256(key).
  - The list is the 2048-word BIP-39 English list.
  - algosdk 3.7.0 `mnemonicFromSeed` / `seedFromMnemonic` (`dist/esm/mnemonic/mnemonic.js`) is the reference.
- **Address:** base32 without padding of (Ed25519 public key || last 4 bytes of SHA-512/256(public key)). Rust already does this in `blockchain.rs`.
- **Ed25519 account:** algosdk `mnemonicToSecretKey` uses the 32-byte key as the nacl seed, so the public key comes from `ed25519_dalek::SigningKey::from_bytes(&key)`.
- **Encryption keys:** `deriveEncryptionKeys(entropy)` is Rust `derive_keys_from_seed(&entropy)`. TypeScript `deriveMLKEMKeyPair(entropy)` and Rust `derive_mlkem768(&entropy)` already agree on `pq-mlkem768.json`.
- **Dependencies:** `sha2` (with SHA-512/256), `data-encoding`, `ed25519-dalek`, `rand` and `zeroize` are already in use. No new crate is needed.
