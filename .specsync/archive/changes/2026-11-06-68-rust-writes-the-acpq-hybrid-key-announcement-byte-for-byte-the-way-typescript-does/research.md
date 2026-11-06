---
change: 68-rust-writes-the-acpq-hybrid-key-announcement-byte-for-byte-the-way-typescript-does
artifact: research
---

# Research

- Spike in a scratch clone of #75's head (`e50eef5`, rerun at `b867cf8`), not in this branch: the draft emitter wrote the vector from TypeScript 0.12.0, and the draft Rust encoder matched the unsigned note, signed note and signing input byte for byte. Rust ran 258 unit, 8 conformance, 4 known-answer and 4 new tests, all passing, and clippy with `-D warnings` was clean. That run is not evidence for this change; the tests are rerun in the branch, failing first.
- Ed25519 signatures are deterministic (RFC 8032), so `@noble/curves` and `ed25519-dalek` produce the same 64 bytes for the same seed and message. The signed note can be pinned exactly.
- The ML-KEM-768 key for seed `0x22` equals `encaps_key` in `vectors/pq-mlkem768.json`. That ties the new vector to the existing derivation vector.
- `sign_encryption_key` in `rs/src/signature.rs` takes `&ed25519_dalek::SigningKey`. The new encoder takes `Option<&SigningKey>` for the same reason: the type cannot hold a key of the wrong length. TypeScript takes a 32-byte seed, so a bad signing-key length is a TypeScript-only check and stays out of the shared vector.
- `ts/tsconfig.json` compiles `src/**/*` with `rootDir: src`, so a test there can't import `ts/scripts/`. The TypeScript test runs the emitter as a subprocess into a temporary file instead, which also runs the recovery command.
- Ruled out:
  - Storing mutations as offsets instead of full note bytes. Full bytes leave nothing for an implementation to interpret, at about 48 KiB.
  - Taking the signing key as raw bytes in Rust. It would differ from `sign_encryption_key` and add an error case the type already prevents.
  - Checking the vector in Go, Python, Kotlin and Swift. Not in Release B. TEST-VECTORS.md says which libraries check it.
