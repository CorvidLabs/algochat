---
id: bump-golang-org-x-crypto-to-v0-52-0
state: implementing
type: bug_fix
base_commit: 40dcc7b57803c0638f75d00c8d3fee14498d652c
---

# Bump golang.org/x/crypto to v0.52.0

## Intent

Bump golang.org/x/crypto to v0.52.0

## Affected Canonical Specs

- None

## Acceptance Criteria

- go.mod requires golang.org/x/crypto v0.52.0, go test passes, and the Go sources still import only chacha20poly1305, curve25519, and hkdf.

## No-spec Rationale

The Go module still uses ChaCha20-Poly1305, Curve25519, and HKDF from golang.org/x/crypto. This version bump does not change the public API or the protocol.
