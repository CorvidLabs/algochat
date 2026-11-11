# Lesson bundle: record-release-1-7-0-as-tagged-and-typescript-0-12-1-as-available-on-github-packages-from-dated-consumer-evidence-req

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Record release 1.7.0 as tagged and TypeScript 0.12.1 as available on GitHub Packages from dated consumer evidence (REQ-release-5), with Rust 0.7.0 still pending and crates.io serving 0.6.0
- **Kind**: BugFix
- **Paths**: docs/RELEASE.md, ts/README.md, ts/index.html
- **Acceptance**: docs/RELEASE.md records release 1.7.0 as tagged (v1.7.0 is commit aadcf738, the squash merge of #89, with a GitHub Release) and v1.6.2 as the previous release; it records TypeScript 0.12.1 as available on GitHub Packages since 2026-11-11 in a dated evidence section (publish-npm.yml run 42941689248 from tag v1.7.0, registry shasum and gitHead, contents identical to npm pack of ts/ at v1.7.0, and an external consumer that installs it and checks vector 07); it keeps Rust 0.7.0 as not yet published with crates.io serving 0.6.0 until publish-crates.yml runs; ts/README.md and ts/index.html say GitHub Packages serves 0.12.1 and their install commands pin 0.12.1. No code, packaging, spec or requirement changes.

## Evidence

- Verification commit: `94595af9a2c651e07b4b938328db51cc810493e9`
- Base commit: `aadcf73813075a5210ac7bf5e8777b5cddc80a65`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

Release 1.7.0 shipped on 2026-11-11 UTC (the evening of 2026-11-10, MST):
- #89 merged as `aadcf73813075a5210ac7bf5e8777b5cddc80a65`.
- Annotated tag `v1.7.0` points at that commit.
- `publish-npm.yml` published TypeScript `@corvidlabs/ts-algochat` 0.12.1 to GitHub Packages from the tag in run 42941689248.
- The GitHub Release v1.7.0 is published.
- Rust 0.7.0 is not published yet. `publish-crates.yml` waits for the owner to confirm the crates.io trusted publisher and revoke the 0.6.0 API token, so crates.io still serves 0.6.0.

Three files on main still describe the state before the release:
- `docs/RELEASE.md` says "Release 1.7.0 is approved, not yet tagged". Its TypeScript row says 0.12.1 is "not yet published", and the GitHub Packages entry still shows 0.12.0.
- `ts/README.md` and `ts/index.html` say GitHub Packages serves 0.12.0 until 0.12.1 is published, and their install commands pin 0.12.0.

REQ-release-5 says registry availability is recorded only from dated external-consumer evidence. That evidence now exists for TypeScript 0.12.1, so this change brings the docs into line with the requirement.

This is a bug fix under Leif's merge rule of 2026-11-10, which the coordinator (hc terminal t370) passed on again when the agents were unpaused. Docs that make the record match existing requirements may run the full SpecSync lifecycle with 0xLeif as approve and review actor, and merge once CI is green and every review thread is resolved. On 2026-11-11 the coordinator said these records count as a bug fix: "Do the records PR NOW for what's live ... merge when green."

Out of scope:
- The Rust 0.7.0 availability record, which waits for publish-crates.yml and the crates.io consumer proof and comes in a later follow-up.
- `CHANGELOG.md`, which is the tagged release text.
- The root `README.md` Rust row, which already says crates.io serves 0.6.0.

## From the change's testing.md

# Testing

Docs only, so there is no product test. The checks are:

- Each new statement matches observed state:
  - the tag object and its target;
  - the GitHub Release;
  - the publish run;
  - the GitHub Packages metadata;
  - an external consumer install.
- No file still says that v1.7.0 is untagged or that TypeScript 0.12.1 is unpublished.
- `fledge lanes run verify` and `fledge trust verify --range origin/main..HEAD` pass.
- Hosted: the PR's checks are green.

## Evidence

Observed 2026-11-11 (UTC), macOS arm64.

- **Tag:** `git ls-remote --tags origin v1.7.0` shows tag object `6f073e9fb8c9b224dc25e4033a650151e3b0c1fd`, and `v1.7.0^{}` is `aadcf73813075a5210ac7bf5e8777b5cddc80a65`, the squash merge of #89. Its tree is identical to #89's head `9c02676`.
- **GitHub Release:** `gh release view v1.7.0` shows "AlgoChat 1.7.0 (Rust crate 0.7.0)", published 2026-11-11T01:51:38Z, not a draft or prerelease. `releases/latest` is v1.7.0.
- **Publish run:** `publish-npm.yml` run 42941689248 ran as `workflow_dispatch` at ref `v1.7.0` (head `aadcf73`), and its `publish` job succeeded.
- **GitHub Packages:** it lists `@corvidlabs/ts-algochat` 0.12.1, version id 1540140676, created 2026-11-11T01:49:34Z.
  - Registry metadata: `gitHead` `aadcf73813075a5210ac7bf5e8777b5cddc80a65`, shasum `d454046392b8bb30b3661727970c44cd6b0a0a13`, integrity `sha512-5phfTNqwNl1kQJPjBGOyNg13b76Hntzu5CnYsDtzS3PbH38jB31iHWKg/4sAwvPPCMeH/jSiQ5kZ4+l/LRJSMg==`.
  - The downloaded tarball has that sha1 and 358 entries.
- **Contents:** a local `npm pack` of `ts/` at `v1.7.0`, after `bun install --frozen-lockfile` and `bun run build`, extracts to the same files as the published tarball (`diff -rq` is empty). The tarball bytes differ.
- **External consumer, 2026-11-11T01:51Z, Node 26.10.0:**
  - Setup: a fresh project outside this repository ran `npm install --ignore-scripts @corvidlabs/ts-algochat@0.12.1` from `npm.pkg.github.com` with a `read:packages` token. It resolved `.../ts-algochat/0.12.1/d454046392b8bb30b3661727970c44cd6b0a0a13`.
  - Results:
    - all 4 vector-07 accounts restore to their addresses;
    - all 14 negatives are rejected;
    - a 26-word phrase is rejected by `validateMnemonic`, and `createChatAccountFromMnemonic` throws on it.
  - No phrase was printed.
- **crates.io:** `publish-crates.yml` has not been dispatched, so crates.io serves `algochat` 0.6.0 as recorded on 2026-11-05.
- **GitHub association:** `gh api /orgs/CorvidLabs/packages/npm/ts-algochat` reports the package still associated with the archived `CorvidLabs/ts-algochat`. The npm metadata names `CorvidLabs/algochat`, directory `ts`.
- **Public npm:** the registry's `latest` is 0.4.0, and it has no 0.12.1.
- **crates.io API, 2026-11-11:** `max_version` and `newest_version` are 0.6.0, updated 2026-11-06T01:32:59Z.
- **Stale text:** a search of `docs/`, `ts/README.md`, `ts/index.html`, `README.md` and `index.html` finds no `ts-algochat@0.12.0`, "not yet tagged", "until 0.12.1" or "Until it is tagged".
- `fledge lanes run verify`: validate passed, and the 41 release unit tests are OK.
- `fledge trust verify --range origin/main..HEAD` at `6fa9a38`: the trust gate passed. Augur's verdict was review, not block, at risk 36. Attest provenance is degraded because the policy is not satisfied, as on earlier PRs.

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
