# Lesson bundle — release-protocol-1-4-0-and-the-library-versions

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Release protocol 1.4.0 and the library versions
- **Kind**: Operations
- **Specs**: release
- **Paths**: scripts/release/packages.py, scripts/release/qualify.py, scripts/release/test_release.py, specs/release/requirements.md
- **Acceptance**: Protocol tag v1.4.0, Swift 1.4.0, TypeScript 0.10.0, Python 0.3.0, Rust 0.4.0, Kotlin 0.3.0, and Go tag go/v0.3.0 are the source versions.

## Evidence

- Verification commit: `b0be1f4d133796df94a7c3e1039fe6ba48d632cf`
- Base commit: `14b346d140d3122b077b362f882f45c534f3299b`
- Verified by: `specsync check --spec release`

## From the change's context.md

# Context

Protocol 1.3.0 did not include room administration or the group mailbox. Those protocols are on main. The owner asked for tag v1.4.0 and for each library to carry its own next version.

## From the change's testing.md

# Testing

REQ-release-5: `docs/RELEASE.md` names tag `v1.4.0`, TypeScript `0.10.0`, Python `0.3.0`, Rust `0.4.0`, Kotlin `0.3.0`, and Go tag `go/v0.3.0`. `scripts/release/packages.py` expects the Kotlin POM `com.corvidlabs:kt-algochat:0.3.0`. `python3 -m unittest discover -s scripts/release -v` passed 25 tests.

## Where these lessons go

- `specs/release/context.md`
