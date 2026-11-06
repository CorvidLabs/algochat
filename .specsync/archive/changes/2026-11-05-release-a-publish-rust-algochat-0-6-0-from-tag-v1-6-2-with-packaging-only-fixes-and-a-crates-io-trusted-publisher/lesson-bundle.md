# Lesson bundle: release-a-publish-rust-algochat-0-6-0-from-tag-v1-6-2-with-packaging-only-fixes-and-a-crates-io-trusted-publisher

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Release A: publish Rust algochat 0.6.0 from tag v1.6.2 with packaging-only fixes and a crates.io trusted-publisher workflow (algochat#67)
- **Kind**: Feature
- **Specs**: release
- **Paths**: rs/Cargo.toml, rs/README.md, rs/.github/workflows/release.yml, .github/workflows/publish-crates.yml, scripts/release/packages.py, scripts/release/test_release.py, specs/release/release.spec.md, specs/release/requirements.md, specs/release/testing.md, specs/release/context.md, docs/RELEASE.md, CHANGELOG.md, README.md, swift/README.md, index.html, hi/crate.md, INTENT.md
- **Acceptance**: A crate packaged from the candidate is algochat 0.6.0 with only its manifest, lockfile, README, LICENSE and src/ library sources and the CorvidLabs/algochat repository link; rs/src stays identical to v1.6.1; and the only publish path is a manual crates.io trusted-publisher workflow for a matching v-tag behind the protected crates-io environment, guarded by release tests.

## Evidence

- Verification commit: `94fdad619abba1e61f6b459b7afb81018b315b8e`
- Base commit: `fae3900f9729724c088bdbe67faf2d8a69655dec`
- Verified by: `specsync check --spec release`

## From the change's context.md

# Context

Raven Desktop is a Rust client. It may depend only on a released `algochat` crate from crates.io: no path, Git, vendored or patched copy, and no local copy of AlgoChat cryptography ([algochat#67](https://github.com/CorvidLabs/algochat/issues/67), `hi/crate.md` CRATE-1, CRATE-6, CRATE-7). Tag `v1.6.1` (`094caa5`) declares `algochat` 0.6.0 in `rs/Cargo.toml`, but crates.io still serves 0.2.1 from the archived `CorvidLabs/rs-algochat`.

Observed on 2026-11-05 at `fae3900`:

- `cargo owner --list algochat` lists only `0xLeif`. The repository root has no crates.io workflow.
- `rs/Cargo.toml` still names `https://github.com/CorvidLabs/rs-algochat` as `repository` and has no `include` list.
- `cargo package --list` in `rs/` lists 122 files, including the archived repo's `.github/workflows/*`, `.specsync/`, agent directories, `specs/`, `tests/`, `examples/` and the `src/bin/pqcross.rs` binary. A crates.io version can be yanked but never replaced.
- `rs/.github/workflows/release.yml` is the archived repo's tag-triggered OIDC publish workflow. GitHub never runs nested workflows. A crates.io trusted publisher may still be bound to `CorvidLabs/rs-algochat` and that file.

Leif's decisions (2026-11-05, via the orchestrator): approve Release A as defined in `.chough/proposals/rust-crate-scope.md` §3; "Tag v1.6.2, no pqcross" (D1, D2); "Trusted publisher workflow" (D3). No tag and no publish happen until Leif approves that release.

A scratch probe (not the repository) with `include = ["/src/*.rs", "/README.md", "/LICENSE"]` packaged 26 entries (manifest, `Cargo.toml.orig`, `Cargo.lock`, `.cargo_vcs_info.json`, README, LICENSE, 20 library sources). `cargo package` verified the build, warned that `pqcross`, the example and `cross_impl` are not shipped, and `cargo build --bin pqcross` still worked in the checkout.

## From the change's design.md

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

## From the change's testing.md

# Testing

Plan:

| Requirement | Check |
| --- | --- |
| REQ-release-2 | `python3 -m unittest discover -s scripts/release -v`: existing `WorkflowTests` still pass for all qualification workflows |
| REQ-release-3 | new `PackageTests`: crate with `src/bin/pqcross.rs`, `tests/`, `.github/` member or `rs-algochat` URL rejected; clean crate accepted; `qualify.py rs` on the candidate accepts the real crate |
| REQ-release-5 | `git diff --exit-code v1.6.1 HEAD -- rs/src` and its unit test; docs name `v1.6.2` and make no availability claim |
| REQ-release-9 | new `PublishCratesWorkflowTests` with mutation cases for each guard |
| package boundary | `cargo package --list` in `rs/` lists only the allowed members; `cargo build --bin pqcross` succeeds |

Repository gates: `fledge run verify` (root), `fledge run verify` in `rs/`, `fledge trust verify`.

After merge, tag and publish (Leif's steps, not part of this change's verification): a fresh project outside the repository resolves `algochat = "0.6.0"` from crates.io and builds, alone and with `algonaut = "0.9.0"`; the result is recorded with its date in `docs/RELEASE.md` and closes #67.

## Local evidence (macOS arm64, 2026-11-05)

- Test first: at `9d2128a` the new tests failed before implementation (`Ran 32 tests`, `FAILED (failures=12, errors=4)`): 12 boundary rejections were not raised and the 4 workflow tests could not read the missing workflow.
- At `a46d3fe` (implementation), `python3 -m unittest discover -s scripts/release -v`: 32 tests OK.
- `python3 scripts/release/qualify.py rs OUT` in a clean clone at `a46d3fe`: exit 0. `cargo test --locked` ran 272 tests with 0 failures; `cargo package --locked` built and verified `algochat-0.6.0.crate` (sha256 `95976eff9a413372ff452496c89c262c26bba326a8a17c2f476c95a42a69024e`); `validate_package` accepted it with the new boundary check; the extracted-crate consumer ran. Caveat: `rs/tests/cross_impl.rs` returns early when sibling fixture directories are absent, so this count is not cross-implementation evidence (#70a, Release B).
- `cargo package --list` in `rs/`: 26 entries, `.cargo_vcs_info.json`, `Cargo.lock`, `Cargo.toml`, `Cargo.toml.orig`, `LICENSE`, `README.md` and 20 `src/*.rs`.
- `cargo build --bin pqcross` in the clean clone: succeeded.
- `git diff --exit-code v1.6.1 HEAD -- rs/src`: no difference.
- `fledge lanes run verify` (root): `validate` and `release_checks` passed.

Not run here: the hosted Release qualification matrix (runs on the PR), any dispatch of `publish-crates.yml`, crates.io or GitHub environment configuration, and the post-publish external consumer.

## Where these lessons go

- `specs/release/context.md`
