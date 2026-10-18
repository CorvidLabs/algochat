# Lesson bundle: record-this-repository-as-the-source-for-every-algochat-library

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Record this repository as the source for every AlgoChat library
- **Kind**: Documentation
- **Specs**: release
- **Paths**: go/go.mod, Package.swift, scripts/release, docs/RELEASE.md
- **Acceptance**: CorvidLabs/algochat is the source. Go module is github.com/CorvidLabs/algochat/go. Swift package name is algochat. Kotlin coordinate is com.corvidlabs:kt-algochat:0.2.0. Protocol tag v1.3.0 stays distinct from the library versions. No publish step is added.

## Evidence

- Verification commit: `ecdda4b20f2849b1b830e3e01f73677e029e2f36`
- Base commit: `b522d8c8f347050d17b44d53758650c65702530f`
- Verified by: `specsync check --spec release`

## From the change's context.md

# Context

The release checklist left Kotlin coordinates, the Go module path, the Swift package name, and REPO-2 unresolved. The owner decided CorvidLabs/algochat is the source for every library. Archived repositories stay archived.

The Go module path changes from `github.com/CorvidLabs/go-algochat` to `github.com/CorvidLabs/algochat/go` so `go get` resolves inside this repository. The Swift package name changes from `swift-algochat` to `algochat`, matching the product import already shown to app authors. Kotlin stays `com.corvidlabs:kt-algochat:0.2.0`. The README had advertised `com.corvidlabs:algochat:0.2.0`.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| REQ-release-5 | `python3 -m unittest discover -s scripts/release` passed, including the Go module identity and the Swift package name |
| REQ-release-8 | The same tests accept `github.com/CorvidLabs/algochat/go` and reject a different module path. `go test -count=1 .` passed in `go/` |

## Where these lessons go

- `specs/release/context.md`
