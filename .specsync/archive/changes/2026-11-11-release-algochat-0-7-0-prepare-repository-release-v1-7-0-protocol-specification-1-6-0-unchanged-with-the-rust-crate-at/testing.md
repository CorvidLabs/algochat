---
change: release-algochat-0-7-0-prepare-repository-release-v1-7-0-protocol-specification-1-6-0-unchanged-with-the-rust-crate-at
artifact: testing
---

# Testing

- Release unit tests: `cd scripts/release && python3 -m unittest test_release`.
- In a clean committed clone of the candidate: `qualify.py rs`, `ts`, `py`, `go`, and `kt` and `swift` where this machine has the toolchains. Exit 0 is required, along with the receipts and the crate sha256.
- Hosted: `release-qualification.yml` on the candidate head. All seven lanes and the aggregate must be green.
- Consumer: a fresh Cargo project outside the repository depends on the extracted `algochat-0.7.0.crate`.
  - It runs `restore_ed25519_account` on a synthetic `07-mnemonic-accounts` phrase, `encode_pq_announcement` and `pq_announcement_signing_input`. It prints no phrase or secret.
  - It is built once alone and once with `algonaut` 0.9.0 (rustls TLS), with `cargo tree` showing the resolved `ctutils`, `reqwest` and `rustls`.
- `fledge lanes run verify`, `specsync check`, `hi check` and `fledge trust verify`.
- `provenance.py v1.6.2 <candidate>`: the result is recorded, and a failure is reported, not hidden.

## Evidence

Candidate `1a87ccc37bdce162f13c14691b466f5c7f462229` (branch `leif/algochat-0.7.0-release`, draft PR #89), 2026-11-10. The definition was not yet approved; these results qualify the candidate for Leif's decision.

- Hosted `release-qualification.yml`, dispatched on the branch: run 42863190030 succeeded on 1a87ccc.
  - Green: `checks`, `ts`, `py`, `go`, `kt`, `rs`, `swift`, `swift-linux` and `complete`.
  - `swift / linux` skipped, as on every recent PR; `swift-linux` is the Linux lane.
- Local clean committed clone on macOS 26.5.2 arm64. Each `qualify.py` lane exited 0, and each receipt names 1a87ccc with a clean tree.
  - `rs` (100 s):
    - fmt and clippy are clean;
    - 261 unit + 11 conformance + 4 cross_impl + 4 pq_announcement + 3 pq_conversation + 3 psk_kept pass in `rs/`, and again inside the extracted `algochat-0.7.0.crate` (49 files, sha256 `f43ae3bc200d0d7d685d4b3e09e4e8ca9af3970e355efd2ae5c127ec1478ee9f`);
    - the consumer ran.
  - `ts`: `bun test` 326 pass, 0 fail; `verify.mjs` 133/133; the packed tarball consumer works.
  - `py`, in an isolated venv on Python 3.14.8: 751 passed and 205 skipped (LocalNet); `py_algochat-0.6.1` wheel and sdist installed in separate venvs.
  - `go`: the tests and the extracted parity test pass.
  - `swift`: the tests and the extracted PQ tests pass.
  - `kt` was not run locally, because the machine has no Java runtime; the hosted `kt / test` is green.
- Pre-publish consumer proof, with rustc 1.99.0 (Homebrew).
  - Setup: two fresh Cargo projects outside the repository depend on `algochat = "0.7.0"`, patched to the extracted `algochat-0.7.0.crate` (`cargo tree` shows that path).
  - Each run:
    - restores all 4 `07-mnemonic-accounts` phrases to their addresses and rejects all 14 negatives;
    - round-trips a created account;
    - encodes 1189- and 1253-byte `ACPQ` notes, verifies the signed one, and refuses a 1183-byte key.
  - No phrase or secret is printed.
  - Alone, it resolved `ctutils` 0.4.2.
  - With `algonaut` 0.9.0, it resolved `ctutils` 0.4.2, `reqwest` 0.13.5 and `rustls` 0.23.46, with no `ctutils` conflict.
  - Not checked: crates.io resolution (nothing is published), the declared Rust 1.85 minimum, and other platforms.
- `fledge lanes run verify`: 41 release tests OK. `specsync check --force` 3/3, `change audit --strict` OK, `hi check` OK.
- `python3 scripts/release/provenance.py v1.6.2 1a87ccc`, after fetching `refs/notes/attest`: exit 1, FAILED. All 12 commits in `8e54462..1a87ccc` have no attestation and no passing-test evidence (`requireAttestation`, `requireTestsPassed`). This is the same degraded provenance every recent PR reported, and it is an input to Leif's release go. It is not hidden or worked around.
- After the qualified candidate `1a87ccc`, the only changes outside `.specsync/` and `.chough/` are text recording Leif's 2026-11-10 decisions, in `CHANGELOG.md`, `docs/RELEASE.md`, `ts/README.md` and `ts/index.html`. No source, test, vector, workflow or version file changes after `1a87ccc`. Pull-request CI runs on the final head.
- After the first ship (archive tip `1f0e98e`), corvid-agent's review at that head (CHANGES_REQUESTED) found three stale doc lines. `bf61b5c` fixes exactly those three: `swift/README.md` names `v1.6.2` as the previous release, `rs/README.md` says Rust 0.7.0 waits for the owner's crates.io trusted-publisher confirmation, and the CHANGELOG #65 entry names py-algochat 0.6.1. A search found no other stale copies. Leif chose to reopen the change for exactly that fix (option A, relayed by coordinator hc t370 on 2026-11-10), and it was reopened as 0xLeif with the reason "corvid-agent's review found three stale 1.7.0 doc lines". `git diff 1f0e98e bf61b5c` is 3 lines in 3 files, text only.

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| REQ-release-5 | `docs/RELEASE.md` names release tag `v1.7.0` (pending, to go on the merge commit) and protocol specification 1.6.0 apart from each library version: TypeScript `0.12.1`, Python `0.6.1`, Rust `0.7.0` from tag `v1.7.0`, Kotlin `com.corvidlabs:kt-algochat:0.5.0`, Go `github.com/CorvidLabs/algochat/go` at `go/v0.5.0` (unchanged), and Swift package `algochat`, product `AlgoChat`, at `v1.7.0`, with `v1.6.2` as the previous release. The manifests agree: `rs/Cargo.toml` 0.7.0, `ts/package.json` 0.12.1 and `py/pyproject.toml` 0.6.1. `CHANGELOG.md` has a 1.7.0 section describing Release B and the Rust 0.6.0 to 0.7.0 migration. Qualification still asserts the Go module path (`scripts/release/qualify.py` checks `go list -m`). `git diff 60f9893 HEAD -- .github` is empty, so no workflow gained a registry token, OIDC publish grant or tag push. The Rust lane packaged, verified and tested `algochat-0.7.0.crate`, both locally and in hosted run 42863190030 (see Evidence above). |
