---
change: bump-golang-org-x-crypto-to-v0-52-0
artifact: context
---

# Context

Dependabot reported 13 alerts on `golang.org/x/crypto` v0.48.0 in `go/go.mod`. Each alert is fixed in v0.52.0. The advisories are in the SSH packages. This module imports `chacha20poly1305`, `curve25519`, and `hkdf` only.

v0.52.0 also requires `golang.org/x/sys` v0.45.0, so `go mod tidy` moves that indirect requirement from v0.41.0.
