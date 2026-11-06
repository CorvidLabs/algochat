---
change: 68-rust-writes-the-acpq-hybrid-key-announcement-byte-for-byte-the-way-typescript-does
artifact: design
---

# Design

- **Rust API** (`rs/src/pq.rs`, re-exported from the crate root like the rest of `pq`):
  - `pq_announcement_signing_input(encaps_key: &[u8]) -> Result<[u8; 32]>`: SHA-256 of `AlgoChat-pq-ek-v1`, `0x01` and the key. A key that is not 1184 bytes is `AlgoChatError::InvalidPublicKey`.
  - `encode_pq_announcement(encaps_key: &[u8], signing_key: Option<&SigningKey>) -> Result<Vec<u8>>`: `ACPQ`, `0x01`, the key and, with a signing key, the Ed25519 signature over the signing input. Same length error.
  - `parse_pq_announcement` uses the same constants and signing input. Its results don't change.
  - The signature comes from `ed25519-dalek`, already a dependency. No new dependency.
- **Vector** `vectors/pq-announcement-v1.json`, written by `ts/scripts/emit-pq-announcement-vector.ts` (run from `ts/`, optional output path):
  - Inputs: `account_seed` (32 × `0x22`), from which the ML-KEM-768 key is derived; the Ed25519 signer is the same seed. `other_signer_seed` (32 × `0x11`) is the wrong signer.
  - Outputs: `encaps_key`, `ed25519_public_key`, `other_signer_public_key`, `signing_input`, `unsigned_note`, `signed_note`, sizes, label and version.
  - `parse_cases`: 17 cases of `name`, `note`, `verifying_key` (or null), `is_announcement` and `expect` (`unverified`, `verified` or `rejected`). Accepted cases return `encaps_key`. The cases cover the unsigned note with and without a key, the signed note with the signer's key, without a key and with another signer's key, a changed key byte, signature byte or version, a zero signature appended, magic `ACPR`, the unsigned and signed lengths ±1, magic only and empty.
  - `bad_encaps_key_lengths`: 0, 1183 and 1185. Encoding, unsigned and signed, and the signing input refuse each.
  - The emitter computes each result with the TypeScript parser and throws if one differs from the intended result.
- **Checks**:
  - `ts/src/pq/announce.test.ts` runs the emitter into a temporary file and requires the committed file to match byte for byte; the failure names the regenerate command. It then checks every field and case with the TypeScript functions.
  - `rs/tests/pq_announcement.rs` reads `rs/vectors/pq-announcement-v1.json` through the crate's public API: the notes from the seed through `derive_mlkem768`, the signing input, round trips, every parse case and every bad length. An unknown field, an unknown result or a missing file fails.
  - `pq-announcement-v1.json` joins `SHARED` in `rs/tests/conformance.rs`. The #70a release check then requires `rs/vectors/` to hold an exact copy.
