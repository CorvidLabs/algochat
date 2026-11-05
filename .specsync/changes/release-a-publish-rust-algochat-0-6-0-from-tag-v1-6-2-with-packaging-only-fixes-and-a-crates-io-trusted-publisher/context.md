---
change: release-a-publish-rust-algochat-0-6-0-from-tag-v1-6-2-with-packaging-only-fixes-and-a-crates-io-trusted-publisher
artifact: context
---

# Context

Raven Desktop is a Rust client. It may depend only on a released `algochat` crate from crates.io: no path, Git, vendored or patched copy, and no local copy of AlgoChat cryptography ([algochat#67](https://github.com/CorvidLabs/algochat/issues/67), `hi/crate.md` CRATE-1, CRATE-6, CRATE-7). Tag `v1.6.1` (`094caa5`) declares `algochat` 0.6.0 in `rs/Cargo.toml`, but crates.io still serves 0.2.1 from the archived `CorvidLabs/rs-algochat`.

Observed on 2026-11-05 at `fae3900`:

- `cargo owner --list algochat` lists only `0xLeif`. The repository root has no crates.io workflow.
- `rs/Cargo.toml` still names `https://github.com/CorvidLabs/rs-algochat` as `repository` and has no `include` list.
- `cargo package --list` in `rs/` lists 122 files, including the archived repo's `.github/workflows/*`, `.specsync/`, agent directories, `specs/`, `tests/`, `examples/` and the `src/bin/pqcross.rs` binary. A crates.io version can be yanked but never replaced.
- `rs/.github/workflows/release.yml` is the archived repo's tag-triggered OIDC publish workflow. GitHub never runs nested workflows. A crates.io trusted publisher may still be bound to `CorvidLabs/rs-algochat` and that file.

Leif's decisions (2026-11-05, via the orchestrator): approve Release A as defined in `.chough/proposals/rust-crate-scope.md` §3; "Tag v1.6.2, no pqcross" (D1, D2); "Trusted publisher workflow" (D3). No tag and no publish happen until Leif approves that release.

A scratch probe (not the repository) with `include = ["/src/*.rs", "/README.md", "/LICENSE"]` packaged 26 entries (manifest, `Cargo.toml.orig`, `Cargo.lock`, `.cargo_vcs_info.json`, README, LICENSE, 20 library sources). `cargo package` verified the build, warned that `pqcross`, the example and `cross_impl` are not shipped, and `cargo build --bin pqcross` still worked in the checkout.
