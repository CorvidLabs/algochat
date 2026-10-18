---
change: record-this-repository-as-the-source-for-every-algochat-library
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| REQ-release-5 | `python3 -m unittest discover -s scripts/release` passed, including the Go module identity and the Swift package name |
| REQ-release-8 | The same tests accept `github.com/CorvidLabs/algochat/go` and reject a different module path. `go test -count=1 .` passed in `go/` |
