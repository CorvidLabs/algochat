---
change: release-protocol-1-6-0-and-the-library-versions
artifact: design
---

# Design

## Approach

Change the version labels that say what this source tree is, the way #38 did for 1.5.0. Move the 1.6.0 history row below 1.5.0. Add CHANGELOG.md for 1.6.0, a "Bots in a room" section in docs/PROTOCOL-FLOWS.md, a "Run your own bot" page in py/docs, and a README pointer.

## Versions

Protocol and Swift 1.6.0. TypeScript 0.12.0. Python 0.5.0. Rust 0.6.0, a minor bump because two public structs gained a field. Kotlin 0.5.0. Go 0.5.0, tag go/v0.5.0. Every library changed in #51, so every version moves.

## Out of scope

No wire change. No registry publish from this change. Tags and the GitHub release are cut from the merge commit after merge, as for v1.5.0.
