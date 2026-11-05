---
hi: 1
families: [CRATE]
---

# Rust crate

## Intent

I want Raven Desktop built, so AlgoChat's Rust crate must be released with interop vectors.

On November 5, 2026, Leif approved this intent and CRATE-1 to CRATE-7 as written, through the orchestrator (orc tab, 11:00 MST): "Approve intent + A and B". Release A is `algochat` 0.6.0 from tag `v1.6.2`, with the Rust source unchanged from `v1.6.1` and packaging fixed ([algochat#67](https://github.com/CorvidLabs/algochat/issues/67)). Release B is 0.7.0 ([#73](https://github.com/CorvidLabs/algochat/issues/73), [#68](https://github.com/CorvidLabs/algochat/issues/68), and the vector parts of [#70](https://github.com/CorvidLabs/algochat/issues/70)). Attachments, Falcon accounts and Auto-join or Open channels are not part of this intent yet.

## Criteria

- **CRATE-1**  I can add AlgoChat to a Rust app from crates.io by version number, with no path, Git or copied dependency.
- **CRATE-2**  A Rust app and Raven web can read each other's messages, and shared test vectors prove that before the crate is released.
- **CRATE-3**  If a shared vector a release relies on is missing, the check fails. It never passes quietly.
- **CRATE-4**  I can create and restore an account in Rust from the same 25 words I use in Raven web, and get the same address and keys.
- **CRATE-5**  I can publish my Hybrid key from Rust the same way Raven web does, signed or unsigned, without building the note myself.
- **CRATE-6**  Apps built on the crate never need their own copy of AlgoChat's cryptography.
- **CRATE-7**  Every crate release names the AlgoChat tag it came from, and nothing goes to crates.io until I approve that release.
