---
change: bump-golang-org-x-crypto-to-v0-52-0
artifact: testing
---

# Testing

## Requirement evidence

| Check | Evidence |
| --- | --- |
| `go/go.mod` requires `golang.org/x/crypto` v0.52.0 | `go get golang.org/x/crypto@v0.52.0` and `go mod tidy` |
| Go tests pass | `go test -count=1 .` in `go/` passed |
| Imports stay on the envelope primitives | `go/` imports `chacha20poly1305`, `curve25519`, and `hkdf` only |
