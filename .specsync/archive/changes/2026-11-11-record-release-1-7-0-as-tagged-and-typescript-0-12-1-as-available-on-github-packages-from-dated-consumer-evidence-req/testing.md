---
change: record-release-1-7-0-as-tagged-and-typescript-0-12-1-as-available-on-github-packages-from-dated-consumer-evidence-req
artifact: testing
---

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
