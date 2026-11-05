---
change: release-a-publish-rust-algochat-0-6-0-from-tag-v1-6-2-with-packaging-only-fixes-and-a-crates-io-trusted-publisher
artifact: design
---

# Design

**Package boundary.** `rs/Cargo.toml` gains `repository = "https://github.com/CorvidLabs/algochat"`, `homepage` (the `rs/` tree), `documentation = "https://docs.rs/algochat"`, `readme` and `include = ["/src/*.rs", "/README.md", "/LICENSE"]`. Name, version 0.6.0, dependencies and every file under `rs/src` stay as in `v1.6.1`. `src/bin/pqcross.rs`, `tests/` and `examples/` remain in the checkout for qualification and the parity mesh.

**Package check.** `validate_package('rs', crate)` additionally requires the packaged manifest's `repository` to be the monorepo URL and rejects any member outside `{Cargo.toml, Cargo.toml.orig, Cargo.lock, .cargo_vcs_info.json, README.md, LICENSE}` and `src/*.rs` under the single top directory, including `src/bin/`.

**Publish workflow** `.github/workflows/publish-crates.yml`:

- `workflow_dispatch` only, inputs `tag` (`vX.Y.Z`) and `version` (`X.Y.Z`); job runs only when dispatched from `refs/heads/main`.
- Top-level `permissions: contents: read`; the single job adds `id-token: write` and runs in environment `crates-io` (Leif configures required reviewer and main-only deployment).
- Checks out `refs/tags/<tag>` with full history and `persist-credentials: false`; fails unless the tag exists, is an ancestor of `origin/main`, and `rs/Cargo.toml` declares `name = "algochat"` and `version = <version>`.
- Runs `python3 scripts/release/qualify.py rs` on that commit (tests, package, package check, consumer) before any credential exists.
- Authenticates with `rust-lang/crates-io-auth-action` pinned to `3268eb413133e2960fa4ae0e963ca76380c54cd9` (v1.0.6) and runs `cargo publish` in `rs/` with the minted token. No repository or environment secret is read.

**Removal.** Delete `rs/.github/workflows/release.yml`, the archived publish workflow, so no one mistakes it for a live path. The other nested `rs/.github` workflows stay as historical references and are excluded from the package.

**Release 1.6.2.** Repository tag `v1.6.2` (cut later, only on Leif's release approval) is the source of `algochat` 0.6.0. Protocol specification stays 1.6.0; Swift, TypeScript, Python, Kotlin and Go versions do not change. Swift consumers see a new tag with identical Swift sources.
