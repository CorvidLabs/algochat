---
change: release-algochat-0-7-0-prepare-repository-release-v1-7-0-protocol-specification-1-6-0-unchanged-with-the-rust-crate-at
artifact: design
---

# Design

There is no visual or interaction change. The only design choice is release identity:
- the repository tag `v1.7.0` (D-r1) is the release line, and is also the Swift package tag;
- the crate version `0.7.0` is the value `publish-crates.yml` checks against `rs/Cargo.toml` at that tag;
- the protocol specification stays 1.6.0.
