# Lesson bundle — document-package-versions-and-language-runtime-requirements-for-all-six-algochat-libraries

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Document package versions and language runtime requirements for all six AlgoChat libraries
- **Kind**: Documentation
- **Specs**: release
- **Paths**: README.md, docs/RELEASE.md, docs/HLD.md, ts/README.md, swift/README.md, py/README.md, rs/README.md, kt/README.md, go/README.md
- **Acceptance**: The root README, all six language READMEs, and release/HLD docs clearly state the current package or module versions and language/runtime requirements from repository manifests; protocol 1.3.0, envelope versions, and library releases are distinguished; configured CI toolchains and unqualified minimum-runtime gaps are labeled; manifests, code, publishing, and protocol behavior do not change.

## Evidence

- Verification commit: `d0d9fb80a22fd6c158dabf658ecdd82aa1c04645`
- Base commit: `3ce096fbacaf7c4e3d962afa16bea094e0505771`
- Verified by: `specsync check --spec release --strict`

## From the change's context.md

# Context

The user requested README and documentation coverage of every language's versions and clarified that this includes both library/package versions and language/runtime requirements.

The root README already named the release package versions, but language READMEs often relied on badges from archived repositories. Runtime constraints were scattered across manifests. Release requirement REQ-release-5 already fixes the package identities and versions; REQ-release-8 requires declared minimum-runtime gaps to remain visible.

This is a documentation correction under existing REPO and RELEASE intent. No new feature criteria, canonical contract change, package/version bump, dependency installation, publication, tag, or workflow change is needed. Scope is the root README, six language READMEs, docs/RELEASE.md, and the versioning portion of docs/HLD.md. Definition approval and implementation acceptance must be recorded only when supplied by the user.

Verification: all 18 root release-check tests and document/registry validation passed via fledge trust verify. The full root strict SpecSync check passed for both specs, and hi check passed for 14 criteria. Rust's required nested strict check passed for five specs. Version facts, the six README sections, and all newly added relative links/anchors were checked against the manifests/files. Augur returned proceed. Trust passed with progressive provenance after the sandbox's GitHub DNS restriction was resolved by running the required gate with network access.

The required nested Python strict check found 29 undocumented PQ exports (105/134 exports documented). Python source and canonical specs match HEAD, so this is a pre-existing gap outside this documentation correction. No language implementation tests, runtime-minimum qualification, registry publication checks, or release operations were performed. Installed SpecSync is 6.0.0; no toolchain was changed. Generated check caches were restored/removed to keep the patch scoped.

Attest provenance: local documentation snapshot 4ccf874f48c0e9746485b18eb5876a6e9608f43f contains exactly the nine modified public documentation files over parent 3ce096fbacaf7c4e3d962afa16bea094e0505771. The branch and real index were not changed. Agent verification was recorded truthfully, and attest verify --commit 4ccf874f48c0e9746485b18eb5876a6e9608f43f --policy .attest.json --json passed with no violations. Lifecycle metadata is outside that snapshot. No human approval or publication is claimed.

## From the change's design.md

# Design

Use the root README for the compact six-language package/runtime overview and docs/RELEASE.md for the full toolchain and qualification matrix. Language READMEs provide their own directly visible version/requirements section and link to the full matrix.

Package manifests, the Gradle wrapper properties, root qualification workflows, and Swift PQ availability annotations supply the facts. Different version domains remain explicit: protocol 1.3.0, envelope 0x01/0x02, protocol ids 0x01/0x02/0x04/0x05, per-library package versions, and compiler/runtime versions.

No implementation or canonical specification changes are required because existing release identities and qualification limits are unchanged. Replacing archived badges avoids presenting an old distribution's registry/release version as the current monorepo source version.

## Where these lessons go

- `specs/release/context.md`
