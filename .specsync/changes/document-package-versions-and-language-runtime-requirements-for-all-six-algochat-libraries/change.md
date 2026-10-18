---
id: document-package-versions-and-language-runtime-requirements-for-all-six-algochat-libraries
state: implementing
type: documentation
base_commit: 3ce096fbacaf7c4e3d962afa16bea094e0505771
---

# Document package versions and language runtime requirements for all six AlgoChat libraries

## Intent

Document package versions and language runtime requirements for all six AlgoChat libraries

## Affected Canonical Specs

- `release`

## Acceptance Criteria

- The root README, all six language READMEs, and release/HLD docs clearly state the current package or module versions and language/runtime requirements from repository manifests; protocol 1.3.0, envelope versions, and library releases are distinguished; configured CI toolchains and unqualified minimum-runtime gaps are labeled; manifests, code, publishing, and protocol behavior do not change.

## No-spec Rationale

Documentation correction only: expose the existing package identities and versions from REQ-release-5 and the declared toolchain constraints, distinguishing configured qualification environments from untested minima; no implementation, manifest, protocol, CI, or release changes.
