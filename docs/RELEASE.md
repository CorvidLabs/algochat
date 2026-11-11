# Release qualification (manual release gates)

A green **Release qualification / complete** check means the candidate passed the
seven hosted lanes below. It does not authorize a release, establish historical
provenance, or prove registry permissions. Protocol **1.6.0** (the specification version), release **1.7.0**, and each library's
package version are distinct. The [package version table](#package-versions-and-distribution) records the release set; the language/runtime requirements are below.

## Candidate and evidence

A change inside one language tree runs that language's workflow, including Swift on Linux when the Swift tree or root package manifest changes. Markdown-only edits in that tree do not. The orchestrator calls every language workflow, plus its own Swift Linux job, only when the pull request or main push changes the protocol, test vectors, `scripts/release`, or the orchestrator workflow. A root README, docs, or intent change does not start those lanes. Manual dispatch still runs the full matrix. Checkout uses the PR **head SHA**, not GitHub's synthetic merge SHA. Credentials are not persisted; permissions are `contents: read`. There are no registry publishing steps or OIDC grants in qualification. The only crates.io path is the separate manual [crates.io publishing](#cratesio-publishing) workflow.

The scripts require Python 3.11+. Each lane starts from a clean checkout, records platform/tool versions and every
command with exit code/output, exercises an external consumer, and uploads
`qualification-<lane>` containing artifacts and a `receipt.json` with SHA-256
hashes. Failed runs retain command logs but never emit a passing receipt. The
final job requires all jobs to succeed and validates all seven receipts and every
listed hash against the requested SHA. `packages.py` separately validates package formats, required members and identities before a lane emits a receipt. `evidence.py` verifies receipt integrity, not package semantics or the authenticity of a self-authored receipt; real hosted consumers remain the usability check. Evidence is a CI record, not a signed
attestation; obtain artifacts only from the verified run on the expected repository
and head. Record the run URL and artifact retention deadline before release.

Download that run's artifacts with `gh run download RUN_ID --dir EVIDENCE_DIR`,
then run:

```sh
python3 scripts/release/evidence.py EVIDENCE_DIR FULL_CANDIDATE_SHA
python3 -m unittest discover -s scripts/release -v
```

A local single-lane reproduction uses a fresh output directory outside the tree:

```sh
python3 scripts/release/qualify.py ts /tmp/algochat-ts-candidate
```

It runs tests, builds and installs dependencies for the selected lane; obtain
local dependency/toolchain authorization first. Local receipts remain `local`
and cannot satisfy the hosted all-six aggregator. No wallet or LocalNet is used.

## Language and runtime versions

These are the versions declared in the current source tree and the toolchains configured by the root qualification workflows. A configured lane is not evidence that a particular candidate passed; use that candidate's receipts for exact compiler versions and results.

| Library | Declared language/runtime | Build tools and configured qualification environment |
| --- | --- | --- |
| TypeScript | [Node.js `>=18.0.0`; development compiler TypeScript `^5.7.0`](../ts/package.json) | [Bun 1.3.6 and Node.js 22](../.github/workflows/ts.yml); the frozen lockfile selects the compiler |
| Swift | [Swift tools 6.0+](../Package.swift) | [macOS runner compiler](../.github/workflows/swift.yml) and [Linux runner compiler](../.github/workflows/release-qualification.yml); exact versions recorded in receipts |
| Python | [Python `>=3.10`](../py/pyproject.toml) | [Python 3.12](../.github/workflows/py.yml) |
| Rust | [Rust `>=1.85`, edition 2021](../rs/Cargo.toml) | [Runner-provided Rust compiler](../.github/workflows/rs.yml); exact version recorded in receipts |
| Kotlin | [Kotlin JVM/serialization plugins 2.1.20; JDK 17 toolchain](../kt/build.gradle.kts) | [Gradle wrapper 8.11](../kt/gradle/wrapper/gradle-wrapper.properties) builds/tests the library; [JDK 17 and Gradle 8.14](../.github/workflows/kt.yml) for the external consumer |
| Go | [Go `1.25.0` minimum](../go/go.mod) | [Go 1.25](../.github/workflows/go.yml) |

Swift's manifest declares iOS 15+, macOS 12+, tvOS 15+, watchOS 8+, and visionOS 1+. The [hybrid ML-KEM methods](../swift/Sources/AlgoChat/Crypto/PQSession.swift) require version 26 of those Apple platforms (also Mac Catalyst 26); their qualification lane covers macOS 26. Linux excludes those methods. Older Apple minima and other Apple platforms are not established by that macOS run.

Node.js 18, Python 3.10, Rust 1.85, older Apple platforms, and Android remain unqualified minimum-runtime gaps. Kotlin's pinned compiler and Gradle versions describe the build, not a promise of compatibility with every Kotlin compiler or Android runtime. The qualification scripts themselves require Python 3.11+, independently of the Python library's 3.10 declaration.

## Qualification coverage and limits

| Lane | Tests / artifact / external consumer | Limits |
| --- | --- | --- |
| TypeScript | Bun tests/build; npm tarball; Node import and TypeScript resolution | Node 22 qualification; declared Node 18 minimum not qualified |
| Python | pytest; wheel and sdist; separate venv install/import for each | Python 3.12; declared Python 3.10 minimum not qualified |
| Rust | rustfmt and clippy; cargo tests in the checkout and again inside the extracted, verified package; packaged-source consumer | Runner compiler recorded; declared Rust 1.85 minimum not qualified |
| Kotlin | tests; jars/POM; isolated Maven-local repository and Gradle consumer | Java 17; Android not qualified |
| Go | tests/build; source/fixture archive; extracted parity test; consumer with explicit local module replacement | Go 1.25; remote module/tag distribution not proved |
| Swift Apple | macOS 26+ tests/build; root source/fixture package; extracted PQ tests; external consumer | Hosted Apple evidence only; older Apple platform minima not qualified |
| Swift Linux | tests/build; exact unsupported `pqcross` assertion; extracted PQ tests and root source consumer | Hybrid methods absent; no Linux ML-KEM claim |

The Kotlin `publishToMavenLocal` command only writes an isolated temporary local
Maven repository. It never invokes `publish` or a remote publishing task and uses
no registry credentials. Swift and Go source archives are not registry packages. They include root `vectors/` and rerun their extracted parity tests. From 0.7.0 the Rust crate ships its integration tests and byte-identical copies of the vectors they read (REQ-release-3), and qualification reruns `cargo test --locked` inside the extracted crate; the consumer then validates compilation and import. The 0.6.0 crate on crates.io predates this and contains no tests.

Bun uses its existing frozen lockfile with install scripts disabled. Rust resolves
and archives Cargo.lock before locked tests/package verification. Python, Maven,
Go and Swift retain their declared dependency constraints; tool versions and logs
identify each execution, but these are not fully hermetic or byte-reproducible
builds. Consumer builds may resolve dependencies independently. No claims of
identical future dependency resolution or runtime-minimum compatibility follow
from one green run.

## Provenance: separate, required release gate

Do not equate the soft Trust success with a releasable provenance ledger. Its
verify lane runs document/registry validation and release-check unit tests; it
is not a substitute for the language workflows. `.attest.json` requires evidence
and passing tests; `.trust.toml` currently reports missing provenance softly.
Neither policy is changed here.

An owner must select the actual release baseline and candidate for each destination.
Fetch the canonical notes ledger without overwriting another owner's local notes:

```sh
git fetch origin refs/notes/attest:refs/notes/attest
python3 scripts/release/provenance.py BASE FULL_CANDIDATE_SHA
attest export --range BASE..FULL_CANDIDATE_SHA --policy .attest.json > provenance.json
```

Use a fresh checkout or reconcile a non-fast-forward notes conflict with its owner;
never force-update notes to make a gate pass. The wrapper requires existing commit
refs, ancestor order and a nonempty range, and propagates Attest failures. A shallow
checkout needs the relevant history before verification. Missing tools/refs/evidence
are failures, not skips. Archive the exported evidence with the verified candidate.

Observed before this change: after fetching notes, `attest verify --range
v1.2.1..d53ecbb3864e089b2ec4cdc6a18dcc209a212af2 --json` failed because `d53ecbb`
lacked required attestations and passing-test evidence. That candidate range
contained PRs #5 and #6. Baseline Trust passed with **degraded provenance**.
Recheck live evidence; this observation does not establish the owner's final range.
An agent may record its own actual verification on its own candidate. It must not
claim another author's historical actions or fabricate human implementation acceptance.

## Package versions and distribution

Release 1.7.0 is tagged. `v1.7.0` is commit `aadcf73813075a5210ac7bf5e8777b5cddc80a65`, the squash merge of [#89](https://github.com/CorvidLabs/algochat/pull/89) for Release B: the Rust crate `algochat` 0.7.0, with #70a, #73, #68 and #70b. It has a [GitHub release](https://github.com/CorvidLabs/algochat/releases/tag/v1.7.0). Leif approved the release on 2026-11-10, accepting degraded provenance as for 1.6.2. TypeScript `0.12.1` was published to GitHub Packages from that tag on 2026-11-11 ([evidence](#typescript-0121-on-github-packages-2026-11-11)). Rust `0.7.0` is not published yet, so crates.io serves `0.6.0`. Its publication through [`publish-crates.yml`](#cratesio-publishing) waits until the owner confirms the crates.io trusted publisher and revokes the API token used for 0.6.0. The post-publish consumer proof follows that publication. Release 1.7.0 keeps protocol specification **1.6.0**: `PROTOCOL.md` is unchanged since `v1.6.2`. Kotlin, Go and Swift sources are unchanged, so the Go module tag stays `go/v0.5.0` and repository tag `v1.7.0` is also the Swift package tag. Release 1.6.2, below, is the previous release.

Release 1.6.2 is tagged: `v1.6.2` is commit `8e54462c1e937572bd8ca5e7274620e139b00b8c` (the squash merge of [#74](https://github.com/CorvidLabs/algochat/pull/74) for [algochat#67](https://github.com/CorvidLabs/algochat/issues/67)), with a [GitHub release](https://github.com/CorvidLabs/algochat/releases/tag/v1.6.2). Leif approved it on 2026-11-05.

`CorvidLabs/algochat` is the source. Archived language repositories stay archived. Release 1.6.2 keeps protocol specification **1.6.0** and changes no library source: `rs/src` is identical to `v1.6.1`. It fixes the Rust crate's packaging and adds the crates.io publish workflow, so that Rust `0.6.0` is published from repository tag `v1.6.2`. Repository tag `v1.6.2` is also the Swift package tag, with Swift sources unchanged. Go does not change, so the Go module tag stays `go/v0.5.0`. Tag `v1.6.1` is the previous release, on commit `094caa5ce446d4c75e7cb16358f298832e661f5a`. Tags `v1.6.0` and `go/v0.5.0` are on commit `7d7b280ae027b55502a3d16d72ab7afac3f93043`. Tags `v1.5.0` and `go/v0.4.0` are on commit `5c4e51f7bf49bb26c4cab6368c142cc8c04344aa`. Tags `v1.4.0` and `go/v0.3.0` are older. Tags `v1.3.0` and `go/v0.2.0` remain on commit `8f4eaff6b68ddd860da7caf4088146cc1b803038`. Registry publication beyond the existing TypeScript GitHub Packages workflow and the crates.io workflow still requires its own authorization.

| Library | Identity | Source version / release tag | Intended distribution destination |
| --- | --- | --- | --- |
| Protocol and Swift | package `algochat`, product `AlgoChat` | `1.7.0` / repository tag `v1.7.0` (protocol specification 1.6.0); previous `1.6.2` / `v1.6.2` | this repository |
| TypeScript | `@corvidlabs/ts-algochat` | `0.12.1` from tag `v1.7.0` | GitHub Packages for this repository: `0.12.1` available since 2026-11-11 ([evidence](#typescript-0121-on-github-packages-2026-11-11)) |
| Python | `py-algochat` | `0.6.1` | PyPI; source version only until a publisher is configured |
| Rust | `algochat` | `0.7.0` from tag `v1.7.0`, not yet published; `0.6.0` from tag `v1.6.2` | `0.7.0`: crates.io through the [trusted-publisher workflow](#cratesio-publishing) once the owner confirms the trusted publisher and revokes the 0.6.0 token, not published. `0.6.0`: [crates.io](https://crates.io/crates/algochat/0.6.0), available since 2026-11-05 ([evidence](#rust-060-on-cratesio-2026-11-05)) |
| Kotlin | `com.corvidlabs:kt-algochat` | `0.5.0` | GitHub Packages for this repository |
| Go | `github.com/CorvidLabs/algochat/go` | tag `go/v0.5.0` | this repository |

Distribution observations checked on **2026-10-30**, after the 1.6.0 tag:

- The [1.3.0 release](https://github.com/CorvidLabs/algochat/releases/tag/v1.3.0) exists and describes the [Go tag](https://github.com/CorvidLabs/algochat/tree/go/v0.2.0) on the same commit. Its notes say Python, Rust, and Kotlin packages were not uploaded in that release.
- The [public npm registry](https://registry.npmjs.org/@corvidlabs%2fts-algochat) has `@corvidlabs/ts-algochat` versions `0.1.1` through `0.4.0`, with `latest` = `0.4.0`. It does not have source version `0.12.0`.
- GitHub Packages metadata lists TypeScript [`0.12.0`](https://github.com/orgs/CorvidLabs/packages/npm/ts-algochat/1475087846), created 2026-10-30 by a manual `Publish npm` workflow run on `7d7b280` ([run 41087000341](https://github.com/CorvidLabs/algochat/actions/runs/41087000341)), and earlier versions including `0.10.0` and `0.9.0`. The package repository association is still archived `CorvidLabs/ts-algochat`.
- The [PyPI metadata endpoint](https://pypi.org/pypi/py-algochat/json) returned HTTP 404. Use the monorepo source installation in the Python README.
- The [crates.io registry](https://crates.io/crates/algochat/0.2.1) reported latest version `0.2.1` from the archived Rust repository, rather than source version `0.6.0`. This was superseded on 2026-11-05; see [Rust 0.6.0 on crates.io](#rust-060-on-cratesio-2026-11-05).
- GitHub Packages metadata lists Kotlin [`0.2.0`](https://github.com/CorvidLabs/kt-algochat/packages/3318797?version=0.2.0) only, associated with archived `CorvidLabs/kt-algochat`. That metadata does not establish availability at the intended monorepo Maven endpoint or artifact equivalence to current source.
- The [Go module proxy](https://proxy.golang.org/github.com/!corvid!labs/algochat/go/@v/list) lists `v0.2.0` through `v0.5.0`. `@latest` is `v0.5.0`, from tag `go/v0.5.0` at `7d7b280`.
- Authenticated remote installs, artifact-to-source provenance, and registry-side publisher bindings were not verified. There is no root PyPI or Kotlin publishing workflow; the crates.io workflow below had not run (and as of 2026-11-05 still has not; see below). Qualification does not configure those external bindings; the TypeScript manual publishing workflow's presence is not a publication receipt.

The old coordinate `com.corvidlabs:algochat:0.2.0` was a documentation error. Apps using archived `swift-algochat` `0.4.0` retain that repository URL until migrated. Source is protocol `1.6.0`, Kotlin `com.corvidlabs:kt-algochat:0.5.0`, and Go `go get github.com/CorvidLabs/algochat/go@v0.5.0`. A root tag `v1.6.1` or `v1.6.0` does not select that nested module. Tag `v1.6.0` is the previous release; `go/v0.5.0` carries over unchanged. What changed is in [CHANGELOG.md](../CHANGELOG.md).

Runtime gaps recorded for this release: Node 18, Python 3.10, Rust 1.85, older Apple OS versions, and Android were not the runners used for qualification. Swift hybrid qualification covers macOS 26 only; its APIs declare availability on Apple OS 26 platforms. Linux builds the Swift library without ML-KEM.

Nested legacy workflows remain historical references, not active root publication
flows. Do not move them to root to activate publishing. The archived Rust
repository's nested publish workflow, `rs/.github/workflows/release.yml`, was removed
in 1.6.2. Any other future publication requires separate explicit authorization,
manual invocation and verified credentials or trusted-publisher bindings; none are
configured by qualification.

### crates.io publishing

Leif authorized a crates.io trusted publisher on 2026-11-05 (decision D3 for
[algochat#67](https://github.com/CorvidLabs/algochat/issues/67)). The Rust crate is
published only by [`publish-crates.yml`](../.github/workflows/publish-crates.yml)
(REQ-release-9):

- manual `workflow_dispatch` from `main`, with inputs `tag` (for example `v1.6.2`) and `version` (for example `0.6.0`);
- the job runs in the `crates-io` GitHub environment, whose required reviewer approves each run;
- it checks out the tag, and fails unless the tag is on `main` and `rs/Cargo.toml` declares `algochat` at that version;
- it runs `scripts/release/qualify.py rs` on that commit, including the crate boundary check, before any credential exists;
- `rust-lang/crates-io-auth-action`, pinned to a commit, exchanges the job's OIDC token for a short-lived crates.io token, which `cargo publish --locked` uses and the action revokes. No registry secret is stored.

The published crate contains only `src/*.rs`, `README.md`, `LICENSE` and Cargo's
generated manifest, lockfile and VCS record. Its tests read `../vectors/` and
therefore run only from a checkout; self-contained packaged vectors are planned for
0.7.0 ([algochat#70](https://github.com/CorvidLabs/algochat/issues/70)).

Owner configuration outside this repository, not verifiable from it: the crates.io
trusted publisher for `CorvidLabs/algochat`, workflow `publish-crates.yml`,
environment `crates-io`; removal of any publisher still bound to the archived
`rs-algochat`; and the `crates-io` environment's required reviewer and `main`-only
deployment rule. A version on crates.io is permanent (it can be yanked, never
replaced). Record availability here only from a dated consumer build that resolves
`algochat = "0.6.0"` from crates.io outside this repository.

#### Rust 0.6.0 on crates.io (2026-11-05)

- **How it was published:** Leif approved the release on 2026-11-05. `algochat` 0.6.0 was then published at 2026-11-06T01:32:59Z (18:32 MST on 2026-11-05) by running `cargo publish --locked` in `rs/` of a fresh clone of tag `v1.6.2`, on Leif's machine with his crates.io API token (account `0xLeif`).
  - It was **not** published through `publish-crates.yml`. crates.io records no trusted-publishing data for this version, and the workflow has never run.
  - This publication therefore does not exercise REQ-release-9's trusted-publisher path. The configured trusted publisher and the `crates-io` environment are untested until a later version is dispatched through the workflow.
  - Before that dispatch, the owner should confirm the crates.io trusted-publisher binding and revoke the API token used for 0.6.0.
- **The published crate:**
  - Registry checksum: `ca8a49fb89d25ae0a92e432606d1cfd0d535e13f9ddc4dea6f1f0a29f4131b9d`.
  - The downloaded `.crate` has 26 members: Cargo's generated manifest, lockfile and VCS record, `README.md`, `LICENSE` and `src/*.rs`. It contains no `src/bin/`, tests or examples.
  - Its `.cargo_vcs_info.json` names commit `8e54462c1e937572bd8ca5e7274620e139b00b8c`, path `rs`, and its manifest names repository `https://github.com/CorvidLabs/algochat`.
  - `git diff v1.6.1 v1.6.2 -- rs/src` is empty.
- **External consumer, 2026-11-05, macOS arm64, rustc 1.95.0:** a fresh Cargo project outside this repository built and ran twice.
  - With `cargo add algochat@0.6.0`, it resolved `algochat` 0.6.0 from the crates.io index.
  - With `algochat` 0.6.0 and `algonaut` 0.9.0 together, it resolved `ctutils` 0.4.2, `reqwest` 0.13.5 and `rustls` 0.23.46.
  - Not checked: the declared Rust 1.85 minimum, other platforms, and any runtime interop beyond building and linking.

### TypeScript 0.12.1 on GitHub Packages (2026-11-11)

- **How it was published:** Leif approved release 1.7.0 on 2026-11-10, including publishing TypeScript 0.12.1 with it. After tag `v1.7.0` was pushed, the manual [`Publish npm`](../.github/workflows/publish-npm.yml) workflow was dispatched at ref `v1.7.0`. [Run 42941689248](https://github.com/CorvidLabs/algochat/actions/runs/42941689248) ran on commit `aadcf73` and published at 2026-11-11T01:49:34Z.
- **The published package:**
  - GitHub Packages lists [`0.12.1`](https://github.com/orgs/CorvidLabs/packages/npm/ts-algochat/1540140676).
  - Its registry metadata names `gitHead` `aadcf73813075a5210ac7bf5e8777b5cddc80a65`, shasum `d454046392b8bb30b3661727970c44cd6b0a0a13` and integrity `sha512-5phfTNqwNl1kQJPjBGOyNg13b76Hntzu5CnYsDtzS3PbH38jB31iHWKg/4sAwvPPCMeH/jSiQ5kZ4+l/LRJSMg==`.
  - The downloaded tarball has that sha1 and 358 entries.
  - A local `npm pack` of `ts/` at `v1.7.0`, after `bun install --frozen-lockfile` and `bun run build`, extracts to the same files. The tarball bytes differ.
  - The package's npm metadata names repository `CorvidLabs/algochat`, directory `ts`. GitHub's package-to-repository association is still the archived `CorvidLabs/ts-algochat`.
- **External consumer, 2026-11-11T01:51Z, macOS arm64, Node 26.10.0:**
  - Setup: a fresh project outside this repository ran `npm install @corvidlabs/ts-algochat@0.12.1` from `npm.pkg.github.com` with a `read:packages` token. It resolved the tarball above.
  - Results:
    - all 4 `07-mnemonic-accounts` phrases restore to their addresses through `validateMnemonic` and `createChatAccountFromMnemonic`;
    - all 14 negatives are rejected;
    - a 26-word phrase is rejected by `validateMnemonic`, and `createChatAccountFromMnemonic` throws on it.
  - No phrase or secret was printed.
  - Not checked: Node 18 (the declared minimum), Bun as the consumer runtime, other platforms, and the public npm registry, which still has 0.4.0.

## Historical 1.3.0 release preparation checklist

This checklist records the preparation state before the tags above. Its unchecked items are not a current assertion that the release is still unpublished, and its checked items do not qualify later commits. For a new candidate, copy the gates into a fresh record with that candidate's SHA, run URLs, artifact hashes, retained evidence, and explicit owner approvals. See [the accuracy report](ACCURACY.md) for remaining evidence gaps.

- [x] Owner selects this repository as the source. Protocol tag `v1.3.0`. Library versions stay TypeScript `0.9.0`, Python `0.2.0`, Rust `0.3.0`, Kotlin `0.2.0`, and Go tag `go/v0.2.0`.
- [ ] All seven exact-head qualification lanes and aggregate pass on the final candidate; archive logs, hashes, and the run URL.
- [x] Declared minimum-runtime gaps are accepted: Node 18, Python 3.10, Rust 1.85, older Apple OS versions, and Android were not qualified. Swift hybrid is macOS 26 only.
- [x] `attest verify` from `v1.2.1` through `a7db7d2` passes. Notes for `d53ecbb`, `40dcc7b`, and `a7db7d2` are on the remote. Attest the merge commit of this change after its checks pass, before the tag.
- [x] Kotlin coordinates, the Go module path, and the Swift package name are recorded above.
- [x] `hi/repo.md` REPO-2 now includes protocols `0x04` and `0x05`. Identifier `0x03` stays unassigned.
- [x] LocalNet: rounds 41739 through 41834, six 2366-byte handshakes, 90 messages, 540 reads, 0 failures, on the squashed 1.3.0 tree. Earlier rounds 41641 through 41736 are the same wire on the pre-squash commit. Rounds 41059 through 41154 are the withdrawn 1278-byte layout.
- [ ] Obtain human implementation acceptance separately from definition approval.
- [ ] Obtain separate authorization before tagging, releasing, publishing, or deploying.
