---
change: document-package-versions-and-language-runtime-requirements-for-all-six-algochat-libraries
artifact: context
---

# Context

The user requested README and documentation coverage of every language's versions and clarified that this includes both library/package versions and language/runtime requirements.

The root README already named the release package versions, but language READMEs often relied on badges from archived repositories. Runtime constraints were scattered across manifests. Release requirement REQ-release-5 already fixes the package identities and versions; REQ-release-8 requires declared minimum-runtime gaps to remain visible.

This is a documentation correction under existing REPO and RELEASE intent. No new feature criteria, canonical contract change, package/version bump, dependency installation, publication, tag, or workflow change is needed. Scope is the root README, six language READMEs, docs/RELEASE.md, and the versioning portion of docs/HLD.md. Definition approval and implementation acceptance must be recorded only when supplied by the user.

Verification: all 18 root release-check tests and document/registry validation passed via fledge trust verify. The full root strict SpecSync check passed for both specs, and hi check passed for 14 criteria. Rust's required nested strict check passed for five specs. Version facts, the six README sections, and all newly added relative links/anchors were checked against the manifests/files. Augur returned proceed. Trust passed with progressive provenance after the sandbox's GitHub DNS restriction was resolved by running the required gate with network access.

The required nested Python strict check found 29 undocumented PQ exports (105/134 exports documented). Python source and canonical specs match HEAD, so this is a pre-existing gap outside this documentation correction. No language implementation tests, runtime-minimum qualification, registry publication checks, or release operations were performed. Installed SpecSync is 6.0.0; no toolchain was changed. Generated check caches were restored/removed to keep the patch scoped.

Attest provenance: local documentation snapshot 4ccf874f48c0e9746485b18eb5876a6e9608f43f contains exactly the nine modified public documentation files over parent 3ce096fbacaf7c4e3d962afa16bea094e0505771. The branch and real index were not changed. Agent verification was recorded truthfully, and attest verify --commit 4ccf874f48c0e9746485b18eb5876a6e9608f43f --policy .attest.json --json passed with no violations. Lifecycle metadata is outside that snapshot. No human approval or publication is claimed.
