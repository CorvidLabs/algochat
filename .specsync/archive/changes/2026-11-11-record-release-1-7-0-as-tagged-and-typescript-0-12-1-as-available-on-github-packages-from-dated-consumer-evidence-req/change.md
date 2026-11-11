---
id: record-release-1-7-0-as-tagged-and-typescript-0-12-1-as-available-on-github-packages-from-dated-consumer-evidence-req
state: archived
type: bug_fix
base_commit: aadcf73813075a5210ac7bf5e8777b5cddc80a65
---

# Record release 1.7.0 as tagged and TypeScript 0.12.1 as available on GitHub Packages from dated consumer evidence (REQ-release-5), with Rust 0.7.0 still pending and crates.io serving 0.6.0

## Intent

Record release 1.7.0 as tagged and TypeScript 0.12.1 as available on GitHub Packages from dated consumer evidence (REQ-release-5), with Rust 0.7.0 still pending and crates.io serving 0.6.0

## Affected Canonical Specs

- None

## Acceptance Criteria

- docs/RELEASE.md records release 1.7.0 as tagged (v1.7.0 is commit aadcf738, the squash merge of #89, with a GitHub Release) and v1.6.2 as the previous release; it records TypeScript 0.12.1 as available on GitHub Packages since 2026-11-11 in a dated evidence section (publish-npm.yml run 42941689248 from tag v1.7.0, registry shasum and gitHead, contents identical to npm pack of ts/ at v1.7.0, and an external consumer that installs it and checks vector 07); it keeps Rust 0.7.0 as not yet published with crates.io serving 0.6.0 until publish-crates.yml runs; ts/README.md and ts/index.html say GitHub Packages serves 0.12.1 and their install commands pin 0.12.1. No code, packaging, spec or requirement changes.

## No-spec Rationale

Docs-only correction: docs/RELEASE.md, ts/README.md and ts/index.html still say v1.7.0 is not yet tagged and TypeScript 0.12.1 is not yet published; they are brought in line with REQ-release-5 (availability recorded from dated external-consumer evidence) after the tag and publication on 2026-11-11; no requirement, contract or code changes
