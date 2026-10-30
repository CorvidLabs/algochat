---
change: release-protocol-1-6-0-and-the-library-versions
artifact: testing
---

# Testing

`python3 -m unittest discover -s scripts/release -v` passed 25 tests. The release scripts name `kt-algochat-0.5.0.jar` and `go/v0.5.0` and do not publish. `bun scripts/validate.ts` passed.

The full suite of every implementation ran on Linux x86_64 against the local network from `py/scripts/native-localnet.sh`: TypeScript `bun test`, Go `go vet` and `go test`, Rust `cargo fmt --check` and `cargo test`, Python `ALGOCHAT_REQUIRE_LOCALNET=1 python -m pytest`, Kotlin `./gradlew test`, Swift `swift test` with its localnet suites, and `bun ts/scripts/group-bot-localnet.ts`. The bot vector regenerates byte for byte. Counts are recorded in the pull request.

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| REQ-protocol-4 | PROTOCOL.md version history names 1.6.0 as room bots, `0x03` ops 13 and 14, listed after 1.5.0. TEST-VECTORS.md, docs/HLD.md, and docs/PROTOCOL-FLOWS.md name 1.6.0. No wire byte changed; the vectors regenerate unchanged. |
| REQ-release-5 | docs/RELEASE.md and the package manifests name protocol 1.6.0, Swift 1.6.0, TypeScript 0.12.0, Python 0.5.0, Rust 0.6.0, Kotlin 0.5.0, and Go 0.5.0, with v1.5.0 and go/v0.4.0 as the previous release. CHANGELOG.md describes 1.6.0 and the Rust breaking change. No tag or registry workflow was added. |
