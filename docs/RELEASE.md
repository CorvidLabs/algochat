# Release qualification (manual release gates)

A green **Release qualification / complete** check means the candidate passed the
seven hosted lanes below. It does not authorize a release, establish historical
provenance, or prove registry permissions. Protocol **1.3.0** and each library's
package version are distinct. This PR does not change either.

## Candidate and evidence

The orchestrator calls the six existing language workflows plus Swift Linux on
every PR, main push and manual dispatch. Checkout uses the PR **head SHA**, not
GitHub's synthetic merge SHA. This also covers shared vectors, manifests and
scripts without path-filter omissions. Credentials are not persisted; permissions
are `contents: read`. There are no registry publishing steps or OIDC grants.

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

## Qualification coverage and limits

| Lane | Tests / artifact / external consumer | Limits |
| --- | --- | --- |
| TypeScript | Bun tests/build; npm tarball; Node import and TypeScript resolution | Node 22 qualification; declared Node 18 minimum not qualified |
| Python | pytest; wheel and sdist; separate venv install/import for each | Python 3.12; declared Python 3.10 minimum not qualified |
| Rust | cargo tests and verified package; packaged-source consumer | Runner compiler recorded; declared Rust 1.85 minimum not qualified |
| Kotlin | tests; jars/POM; isolated Maven-local repository and Gradle consumer | Java 17; Android not qualified |
| Go | tests/build; source/fixture archive; extracted parity test; consumer with explicit local module replacement | Go 1.25; remote module/tag distribution not proved |
| Swift Apple | macOS 26+ tests/build; root source/fixture package; extracted PQ tests; external consumer | Hosted Apple evidence only; older Apple platform minima not qualified |
| Swift Linux | tests/build; exact unsupported `pqcross` assertion; extracted PQ tests and root source consumer | Hybrid methods absent; no Linux ML-KEM claim |

The Kotlin `publishToMavenLocal` command only writes an isolated temporary local
Maven repository. It never invokes `publish` or a remote publishing task and uses
no registry credentials. Swift and Go source archives are not registry packages. They include root `vectors/` and rerun their extracted parity tests. The Rust crate consumer validates compilation/import, not its packaged full test suite: `rs/src/pq.rs` reads `../vectors/pq-mlkem768.json`, outside the published crate. Rust full tests run in the checkout; self-contained packaged-test fixtures remain a release packaging decision, not a claimed pass.

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

## Distribution decisions

`CorvidLabs/algochat` is the source. Archived language repositories stay archived. These identities are the release set. Creating the tags and publishing still need a separate authorization.

| Library | Identity | Version | Where a later publish goes |
| --- | --- | --- | --- |
| Protocol and Swift | package `algochat`, product `AlgoChat` | repository tag `v1.3.0` | this repository |
| TypeScript | `@corvidlabs/ts-algochat` | `0.9.0` | GitHub Packages for this repository |
| Python | `py-algochat` | `0.2.0` | PyPI, trusted publisher still not configured |
| Rust | `algochat` | `0.3.0` | crates.io, trusted publisher still not configured |
| Kotlin | `com.corvidlabs:kt-algochat` | `0.2.0` | GitHub Packages for this repository |
| Go | `github.com/CorvidLabs/algochat/go` | tag `go/v0.2.0` | this repository |

Kotlin's README now matches the POM. The old coordinate `com.corvidlabs:algochat:0.2.0` was the documentation error. Go consumers use `go get github.com/CorvidLabs/algochat/go@v0.2.0` after tag `go/v0.2.0`. A root tag `v1.3.0` does not select that nested module. Apps still on archived `swift-algochat` `0.4.0` keep that URL. New Swift apps use this repository from `1.3.0`.

Runtime gaps accepted for this release: Node 18, Python 3.10, Rust 1.85, older Apple OS versions, and Android were not the runners that passed qualification. Swift hybrid remains macOS 26 only. Linux builds the Swift library without ML-KEM.

Nested legacy workflows remain historical references, not active root publication
flows. Do not move them to root to activate publishing. Any future publication
requires separate explicit authorization, manual invocation and verified credentials
or trusted-publisher bindings; none are configured by qualification.

## Release checklist

- [x] Owner selects this repository as the source. Protocol tag `v1.3.0`. Library versions stay TypeScript `0.9.0`, Python `0.2.0`, Rust `0.3.0`, Kotlin `0.2.0`, and Go tag `go/v0.2.0`.
- [ ] All seven exact-head qualification lanes and aggregate pass on the final candidate; archive logs, hashes, and the run URL.
- [x] Declared minimum-runtime gaps are accepted: Node 18, Python 3.10, Rust 1.85, older Apple OS versions, and Android were not qualified. Swift hybrid is macOS 26 only.
- [ ] Direct release-range Attest policy verification passes from `v1.2.1` through the final candidate. `d53ecbb` and `40dcc7b` still have no notes. Attest them, and every later commit, before the tag.
- [x] Kotlin coordinates, the Go module path, and the Swift package name are recorded above.
- [x] `hi/repo.md` REPO-2 now includes protocols `0x04` and `0x05`. Identifier `0x03` stays unassigned.
- [x] LocalNet: rounds 41739 through 41834, six 2366-byte handshakes, 90 messages, 540 reads, 0 failures, on the squashed 1.3.0 tree. Earlier rounds 41641 through 41736 are the same wire on the pre-squash commit. Rounds 41059 through 41154 are the withdrawn 1278-byte layout.
- [ ] Obtain human implementation acceptance separately from definition approval.
- [ ] Obtain separate authorization before tagging, releasing, publishing, or deploying.
