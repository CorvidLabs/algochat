---
change: prepare-protocol-1-5-0-and-the-library-versions
artifact: testing
---

# Testing

`python3 -m unittest discover -s scripts/release -v` passed 25 tests. The release scripts reject a wrong Kotlin coordinate and do not publish.

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| REQ-protocol-4 | PROTOCOL.md version history names 1.5.0 as the delta room note. The identifier table still says tag v1.4.0 includes `0x03`, `0x06`, and `0x07`. |
| REQ-release-5 | docs/RELEASE.md and the package manifests name protocol 1.5.0, TypeScript 0.11.0, Python 0.4.0, Rust 0.5.0, Kotlin 0.4.0, and Go 0.4.0. No tag or registry workflow was added. |
