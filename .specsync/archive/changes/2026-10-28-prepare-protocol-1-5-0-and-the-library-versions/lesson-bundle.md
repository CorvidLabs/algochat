# Lesson bundle: prepare-protocol-1-5-0-and-the-library-versions

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Prepare protocol 1.5.0 and the library versions
- **Kind**: Documentation
- **Specs**: release, protocol
- **Paths**: PROTOCOL.md, docs/RELEASE.md, ts/package.json, py/pyproject.toml, rs/Cargo.toml, kt/build.gradle.kts
- **Acceptance**: Prepared source names protocol 1.5.0 with TypeScript 0.11.0 Python 0.4.0 Rust 0.5.0 Kotlin 0.4.0 and Go 0.4.0 and does not cut the tags.

## Evidence

- Verification commit: `8a7d879500ce8e7c31d4255ae4ae52f051fafe89`
- Base commit: `cbf50acb463536e3b8ee91e6386badb490c443f9`
- Verified by: `specsync check --spec protocol --spec release`

## From the change's context.md

# Context

Room notes that omit the member list are on main in cbf50ac. PROTOCOL.md already specifies the delta note, the 256-person cap, and channels. The version header still said 1.4.0. This change names that work 1.5.0 and moves the library source versions forward. It does not cut `v1.5.0` or `go/v0.4.0`, and it does not publish a package.

## From the change's design.md

# Design

## Approach

Change the version labels that say what this source tree is. Leave historical sentences that say tag v1.4.0 includes protocols 0x03, 0x06, and 0x07. Add a 1.5.0 history row for the delta room note.

## Versions

Protocol and Swift 1.5.0. TypeScript 0.11.0. Python 0.4.0. Rust 0.5.0. Kotlin 0.4.0. Go 0.4.0, prepared tag go/v0.4.0.

## Out of scope

No git tag. No GitHub release. No npm, PyPI, crates.io, or Maven publish. No wire change.

## From the change's testing.md

# Testing

`python3 -m unittest discover -s scripts/release -v` passed 25 tests. The release scripts reject a wrong Kotlin coordinate and do not publish.

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| REQ-protocol-4 | PROTOCOL.md version history names 1.5.0 as the delta room note. The identifier table still says tag v1.4.0 includes `0x03`, `0x06`, and `0x07`. |
| REQ-release-5 | docs/RELEASE.md and the package manifests name protocol 1.5.0, TypeScript 0.11.0, Python 0.4.0, Rust 0.5.0, Kotlin 0.4.0, and Go 0.4.0. No tag or registry workflow was added. |

## Where these lessons go

- `specs/release/context.md`
- `specs/protocol/context.md`
