---
change: bump-golang-org-x-crypto-to-v0-52-0
artifact: tasks
---

# Tasks

- Set `golang.org/x/crypto` to v0.52.0 in `go/go.mod`.
- Refresh `go/go.sum`, including the indirect `golang.org/x/sys` v0.45.0 requirement.
- Run `go test` in `go/`.
