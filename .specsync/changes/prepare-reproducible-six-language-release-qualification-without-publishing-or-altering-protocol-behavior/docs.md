---
change: prepare-reproducible-six-language-release-qualification-without-publishing-or-altering-protocol-behavior
artifact: docs
---

# Docs

Proposed docs/RELEASE.md will include: release candidate/base/head selection; full fetched Attest range verification; exact-commit six-language qualification table; artifact inspection commands; identities and package versions; manual destination authorization and credential prerequisites; owner sign-off and unreproduced LocalNet evidence.

Unsettled owner decisions: release baseline per destination; historical missing provenance for d53ecbb; interpretation of historical REPO-2; Go existing module source mapping; Swift main-repository release tag/version strategy; GitHub Packages ownership/credential availability; existing PyPI/crates.io trusted publisher repository bindings. Package versions remain 0.9.0 TypeScript, 0.2.0 Python, 0.3.0 Rust and 0.2.0 Kotlin unless separately authorized. Protocol 1.3.0 does not imply uniform package versions.

Proposed human-intent sentences, not yet captured or confirmed:

- RELEASE-1: I can qualify all six libraries before a release without publishing packages.
- RELEASE-2: I can see exactly which release evidence is missing and which checks ran against the candidate commit.

Kotlin audit finding to expose: configured generated coordinate is expected to be com.corvidlabs:kt-algochat:0.2.0 (pending actual POM verification), whereas README installs com.corvidlabs:algochat:0.2.0. Public registry identity is unverified. Confirm the POM in hosted CI and document the mismatch without changing identity or destination.

Exact-revision evidence must include SHA, tree state, platform/toolchain, commands/outcomes and artifact hashes. Consumer checks happen outside the checkout; any Go local replacement is explicitly labeled. Declared runtime-minimum checks and absent LocalNet reproduction remain visible limitations.
