# Lesson bundle — release-protocol-1-6-0-and-the-library-versions

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Release protocol 1.6.0 and the library versions
- **Kind**: Documentation
- **Specs**: release, protocol
- **Paths**: PROTOCOL.md, docs/RELEASE.md, ts/package.json, py/pyproject.toml, rs/Cargo.toml, kt/build.gradle.kts, CHANGELOG.md, docs/PROTOCOL-FLOWS.md, py/docs/run-your-own-bot.md
- **Acceptance**: Source names protocol 1.6.0 with Swift 1.6.0 TypeScript 0.12.0 Python 0.5.0 Rust 0.6.0 Kotlin 0.5.0 and Go 0.5.0, and the changelog and docs describe what 1.6.0 adds.

## Evidence

- Verification commit: `78d57f66ee568ee4db3a8f60be69f512d3a8f0e3`
- Base commit: `67072f2cc9841bca5c51bc490642cfc99247a40c`
- Verified by: `specsync check --spec protocol --spec release`

## From the change's context.md

# Context

Room bots (#51), the Python agent (#49, #52 to #56), the bot identity NFT (#60), the encryption_public_key bytes fix (#50) and the swift-algorand 0.4 dependency (#58) are on main at 67072f2. #51 already set PROTOCOL.md and the README badge to 1.6.0, but put the 1.6.0 history row above 1.5.0, and the library versions still said the 1.5.0 set. Leif asked for the 1.6.0 release PR, docs, tag and release on 30 October 2026 (t762u). v1.5.0 shipped as PR #38 and then a GitHub release with tags v1.5.0 and go/v0.4.0 on the merge commit; this change follows that.

## From the change's design.md

# Design

## Approach

Change the version labels that say what this source tree is, the way #38 did for 1.5.0. Move the 1.6.0 history row below 1.5.0. Add CHANGELOG.md for 1.6.0, a "Bots in a room" section in docs/PROTOCOL-FLOWS.md, a "Run your own bot" page in py/docs, and a README pointer.

## Versions

Protocol and Swift 1.6.0. TypeScript 0.12.0. Python 0.5.0. Rust 0.6.0, a minor bump because two public structs gained a field. Kotlin 0.5.0. Go 0.5.0, tag go/v0.5.0. Every library changed in #51, so every version moves.

## Out of scope

No wire change. No registry publish from this change. Tags and the GitHub release are cut from the merge commit after merge, as for v1.5.0.

## From the change's testing.md

# Testing

`python3 -m unittest discover -s scripts/release -v` passed 25 tests. The release scripts name `kt-algochat-0.5.0.jar` and `go/v0.5.0` and do not publish. `bun scripts/validate.ts` passed.

The full suite of every implementation ran on Linux x86_64 against the local network from `py/scripts/native-localnet.sh`: TypeScript `bun test`, Go `go vet` and `go test`, Rust `cargo fmt --check` and `cargo test`, Python `ALGOCHAT_REQUIRE_LOCALNET=1 python -m pytest`, Kotlin `./gradlew test`, Swift `swift test` with its localnet suites, and `bun ts/scripts/group-bot-localnet.ts`. The bot vector regenerates byte for byte. Counts are recorded in the pull request.

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| REQ-protocol-4 | PROTOCOL.md version history names 1.6.0 as room bots, `0x03` ops 13 and 14, listed after 1.5.0. TEST-VECTORS.md, docs/HLD.md, and docs/PROTOCOL-FLOWS.md name 1.6.0. No wire byte changed; the vectors regenerate unchanged. |
| REQ-release-5 | docs/RELEASE.md and the package manifests name protocol 1.6.0, Swift 1.6.0, TypeScript 0.12.0, Python 0.5.0, Rust 0.6.0, Kotlin 0.5.0, and Go 0.5.0, with v1.5.0 and go/v0.4.0 as the previous release. CHANGELOG.md describes 1.6.0 and the Rust breaking change. No tag or registry workflow was added. |

## Where these lessons go

- `specs/release/context.md`
- `specs/protocol/context.md`
