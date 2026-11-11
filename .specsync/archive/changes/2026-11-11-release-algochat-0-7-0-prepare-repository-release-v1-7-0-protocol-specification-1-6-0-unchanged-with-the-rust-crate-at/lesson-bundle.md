# Lesson bundle: release-algochat-0-7-0-prepare-repository-release-v1-7-0-protocol-specification-1-6-0-unchanged-with-the-rust-crate-at

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Release algochat 0.7.0: prepare repository release v1.7.0 (protocol specification 1.6.0 unchanged) with the Rust crate at 0.7.0 from that tag, the CHANGELOG release section, release documentation, qualification of every lane and a pre-publish external-consumer proof; the tag and crates.io publication wait for Leif's release go
- **Kind**: Operations
- **Specs**: release
- **Paths**: rs/Cargo.toml, rs/README.md, CHANGELOG.md, docs/RELEASE.md, README.md, index.html, docs/HLD.md, specs/release/
- **Acceptance**: rs/Cargo.toml declares algochat 0.7.0 and CHANGELOG.md has a 1.7.0 release section (Release B: #70a mandatory packaged vectors, #73 25-word phrase accounts, #68 ACPQ write path, #70b Hybrid and kept 0x02 vectors, plus rs-lint, #79 and #65) with the library version table; docs/RELEASE.md, README.md, rs/README.md, docs/HLD.md and index.html name repository release v1.7.0 (protocol specification 1.6.0, PROTOCOL.md unchanged since v1.6.2), Rust 0.7.0 from tag v1.7.0 as pending publication with no availability claim, and the TypeScript and Python versions Leif decides (D-r2, D-r3); REQ-release-5 names those identities; every qualification lane (TypeScript, Swift, Python, Rust, Kotlin, Go, Swift Linux) passes on the candidate head, with the Rust lane building, verifying and testing algochat-0.7.0.crate from the package; a fresh Cargo project outside the repository builds and runs against that packaged crate alone and alongside algonaut 0.9.0, calling the 0.7.0 APIs on synthetic inputs, with the resolved ctutils, reqwest and rustls versions recorded; no tag is pushed and nothing is published; the release tag, publication through publish-crates.yml and the post-publish crates.io consumer proof wait for Leif's release go.

## Evidence

- Verification commit: `9d2fbf7c542f675ab63557c329378ca138534ecc`
- Base commit: `60f9893654b96b4c6e053cf1826df2385497a9c7`
- Verified by: `specsync check --spec release`

## From the change's context.md

# Context

Release B is complete on main at 60f9893. Its four parts are #75 (#70a), #86 (#73), #77 (#68) and #78 (#70b). rs-lint (#85), #79 (#87) and #65 (#88) also merged. Leif approved Release B on 2026-11-05 ("Approve intent + A and B") as defined in `.chough/proposals/rust-crate-scope.md` §3. Step 5 there is: "Qualify, then a human release decision, publish, and an external-consumer proof as in Release A". On 2026-11-10 Leif asked, through coordinator hc t370, for this preparation: the changelog, qualification of every lane and the consumer proof. Both the definition approval and the release go stay his.

Library sources since `v1.6.2`:
- `PROTOCOL.md` is unchanged, so the protocol specification stays 1.6.0.
- `rs/src` changed in 7 files (new APIs), so the crate goes to 0.7.0.
- `ts/src/services/mnemonic.service.ts` changed (#73: phrases longer than 25 words are rejected).
- `py/src/algochat/agent/policy.py` and `core.py` changed (#65).
- Kotlin, Go and Swift sources are unchanged.

Leif's decisions, relayed by coordinator hc t370 on 2026-11-10 together with his approval of this definition and his release go:
- D-r1, repository tag: `v1.7.0`.
- D-r2, TypeScript: `0.12.1`, published to GitHub Packages with the release by the manual `Publish npm` workflow from tag `v1.7.0`, after the merge.
- D-r3, Python: `0.6.1` in source only. PyPI has no publisher.
- Provenance: he accepts it degraded, as for 1.6.2. `provenance.py v1.6.2 1a87ccc` fails because none of the 12 commits since `v1.6.2` is attested.
- crates.io: `publish-crates.yml` is dispatched only after he confirms the trusted publisher (`CorvidLabs/algochat`, `publish-crates.yml`, environment `crates-io`) and revokes the API token used for 0.6.0.

**Order.** The candidate edits were prepared on a draft PR before the native definition approval, at the coordinator's instruction. Leif's single decision therefore covers a concrete, qualified candidate. Nothing merges, tags or publishes before he approves.

**Ruled out:**
- A `v0.7.0` repository tag. Repository tags are the release and Swift package line, and the crate version is a separate input to `publish-crates.yml`.
- Publishing from this PR or by hand. REQ-release-9 makes `publish-crates.yml` the only path. 0.6.0 was published by hand, so the trusted publisher has never run.

## From the change's design.md

# Design

There is no visual or interaction change. The only design choice is release identity:
- the repository tag `v1.7.0` (D-r1) is the release line, and is also the Swift package tag;
- the crate version `0.7.0` is the value `publish-crates.yml` checks against `rs/Cargo.toml` at that tag;
- the protocol specification stays 1.6.0.

## From the change's testing.md

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

## Where these lessons go

- `specs/release/context.md`
