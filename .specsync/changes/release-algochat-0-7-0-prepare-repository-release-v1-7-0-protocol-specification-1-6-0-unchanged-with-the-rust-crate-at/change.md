---
id: release-algochat-0-7-0-prepare-repository-release-v1-7-0-protocol-specification-1-6-0-unchanged-with-the-rust-crate-at
state: verifying
type: operations
base_commit: 60f9893654b96b4c6e053cf1826df2385497a9c7
---

# Release algochat 0.7.0: prepare repository release v1.7.0 (protocol specification 1.6.0 unchanged) with the Rust crate at 0.7.0 from that tag, the CHANGELOG release section, release documentation, qualification of every lane and a pre-publish external-consumer proof; the tag and crates.io publication wait for Leif's release go

## Intent

Release algochat 0.7.0: prepare repository release v1.7.0 (protocol specification 1.6.0 unchanged) with the Rust crate at 0.7.0 from that tag, the CHANGELOG release section, release documentation, qualification of every lane and a pre-publish external-consumer proof; the tag and crates.io publication wait for Leif's release go

## Affected Canonical Specs

- `release`

## Acceptance Criteria

- rs/Cargo.toml declares algochat 0.7.0 and CHANGELOG.md has a 1.7.0 release section (Release B: #70a mandatory packaged vectors, #73 25-word phrase accounts, #68 ACPQ write path, #70b Hybrid and kept 0x02 vectors, plus rs-lint, #79 and #65) with the library version table; docs/RELEASE.md, README.md, rs/README.md, docs/HLD.md and index.html name repository release v1.7.0 (protocol specification 1.6.0, PROTOCOL.md unchanged since v1.6.2), Rust 0.7.0 from tag v1.7.0 as pending publication with no availability claim, and the TypeScript and Python versions Leif decides (D-r2, D-r3); REQ-release-5 names those identities; every qualification lane (TypeScript, Swift, Python, Rust, Kotlin, Go, Swift Linux) passes on the candidate head, with the Rust lane building, verifying and testing algochat-0.7.0.crate from the package; a fresh Cargo project outside the repository builds and runs against that packaged crate alone and alongside algonaut 0.9.0, calling the 0.7.0 APIs on synthetic inputs, with the resolved ctutils, reqwest and rustls versions recorded; no tag is pushed and nothing is published; the release tag, publication through publish-crates.yml and the post-publish crates.io consumer proof wait for Leif's release go.

## No-spec Rationale

Not applicable
