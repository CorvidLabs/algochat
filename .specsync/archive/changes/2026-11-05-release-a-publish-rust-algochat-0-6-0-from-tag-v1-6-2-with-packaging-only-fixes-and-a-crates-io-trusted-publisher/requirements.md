---
change: release-a-publish-rust-algochat-0-6-0-from-tag-v1-6-2-with-packaging-only-fixes-and-a-crates-io-trusted-publisher
artifact: requirements
---

# Requirements

Traceability: CRATE-1, CRATE-6, CRATE-7 in `hi/crate.md`; algochat#67. Canonical changes are in `deltas/release.md`.

- The packaged `algochat` crate contains only its manifest, `Cargo.toml.orig`, `Cargo.lock`, `.cargo_vcs_info.json`, `README.md`, `LICENSE` and the library sources `src/*.rs` (REQ-release-3).
- The packaged manifest keeps name `algochat`, version `0.6.0`, and names `https://github.com/CorvidLabs/algochat` as its repository (REQ-release-3, REQ-release-5).
- Every file under `rs/src` is byte-identical to tag `v1.6.1` (REQ-release-5).
- Qualification workflows stay read-only with no publication step (REQ-release-2).
- The only crates.io publication path is a manually dispatched trusted-publisher workflow for an existing release tag on main whose crate version matches, run in the protected `crates-io` environment, after the Rust qualification lane passes on that commit, with no stored token (REQ-release-9).
- Release instructions name release tag `v1.6.2` as the source of Rust `0.6.0` and do not claim crates.io availability until dated external-consumer evidence exists (REQ-release-5).
