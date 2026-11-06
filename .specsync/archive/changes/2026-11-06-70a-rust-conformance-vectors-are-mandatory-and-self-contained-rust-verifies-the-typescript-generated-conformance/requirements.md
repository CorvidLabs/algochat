---
change: 70a-rust-conformance-vectors-are-mandatory-and-self-contained-rust-verifies-the-typescript-generated-conformance
artifact: requirements
---

# Requirements

Traceability: CRATE-2 and CRATE-3 in `hi/crate.md`, algochat#70 (#70a). The canonical changes are in `deltas/protocol.md` and `deltas/release.md`.

- Rust checks every section and case of `ts/conformance/vectors/00-06`, and it fails on a missing file, a missing or extra section, or an unrecognized case. The only pending exception is the 01 mnemonic chain, which names #73 (REQ-protocol-10).
- No Rust test returns early or skips because a fixture is missing (REQ-protocol-10).
- Every vector Rust reads is a byte-identical copy under `rs/vectors/` of a canonical file, and the release check fails on a missing, extra or differing copy (REQ-protocol-10, REQ-release-3).
- The crate contains `vectors/*.json` and `tests/*.rs` as well as the Release A members, and nothing else (REQ-release-3).
- Rust qualification runs `cargo test --locked` inside the extracted crate, and TypeScript qualification runs `bun conformance/tools/verify.mjs` (REQ-release-1).
