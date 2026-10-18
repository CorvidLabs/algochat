# Lesson bundle: bump-golang-org-x-crypto-to-v0-52-0

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Bump golang.org/x/crypto to v0.52.0
- **Kind**: BugFix
- **Paths**: go/go.mod, go/go.sum
- **Acceptance**: go.mod requires golang.org/x/crypto v0.52.0, go test passes, and the Go sources still import only chacha20poly1305, curve25519, and hkdf.

## Evidence

- Verification commit: `f752c908abaa45f517b880af088feadf22186810`
- Base commit: `40dcc7b57803c0638f75d00c8d3fee14498d652c`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

Dependabot reported 13 alerts on `golang.org/x/crypto` v0.48.0 in `go/go.mod`. Each alert is fixed in v0.52.0. The advisories are in the SSH packages. This module imports `chacha20poly1305`, `curve25519`, and `hkdf` only.

v0.52.0 also requires `golang.org/x/sys` v0.45.0, so `go mod tidy` moves that indirect requirement from v0.41.0.

## From the change's testing.md

# Testing

## Requirement evidence

| Check | Evidence |
| --- | --- |
| `go/go.mod` requires `golang.org/x/crypto` v0.52.0 | `go get golang.org/x/crypto@v0.52.0` and `go mod tidy` |
| Go tests pass | `go test -count=1 .` in `go/` passed |
| Imports stay on the envelope primitives | `go/` imports `chacha20poly1305`, `curve25519`, and `hkdf` only |

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
