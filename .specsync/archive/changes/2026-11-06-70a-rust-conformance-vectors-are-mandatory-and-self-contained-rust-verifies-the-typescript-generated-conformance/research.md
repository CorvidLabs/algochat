---
change: 70a-rust-conformance-vectors-are-mandatory-and-self-contained-rust-verifies-the-typescript-generated-conformance
artifact: research
---

# Research

- The TS conformance vectors cover protocol constants, HKDF/X25519 derivation, ECDH, key-announcement signatures, mnemonic-to-account chains (01), version 0x02 standard and PSK envelope encoding plus captured envelopes (02, 04), the PSK ratchet at counters 0/1/99/100/101/250 and the replay-window transcript (03), the PSK exchange URI (05), and 15 named negative cases (06). Rust already has public APIs for all of these except mnemonic-to-seed, which is #73. So the `mnemonic` field of the 01 accounts is the one case left pending, and it names #73.
- Files 00, 01, 03 and 05 are fully deterministic. 02, 04 and 06 have captured envelopes that change whenever someone regenerates them. Rust reads them as frozen files and never regenerates them.
- The negative cases in 06 are identified only by their `name` text. Rust maps each name to an operation, and an unknown name fails, so a case added in TS can't be skipped without anyone noticing.
- Cargo only packages files under the package root. Symlinks break on Windows checkouts and hide drift. The plan uses copies under `rs/vectors/`, plus a release check that each copy is byte-identical to its source and that every source has a copy.
- Size: the 12 files total about 448 KiB, well under the crates.io limit.
- Ruled out:
  - Keeping `../vectors` paths and testing only from the repository. That contradicts the approved scope ("make the packaged crate's tests pass from the .crate tarball").
  - Recreating the archived `test-envelopes-*` fixtures from Swift, Python and Kotlin. They were never present here, and cross-language interop already has its own LocalNet requirements (REQ-protocol-1..9).
