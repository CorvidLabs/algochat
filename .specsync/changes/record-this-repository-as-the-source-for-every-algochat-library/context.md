---
change: record-this-repository-as-the-source-for-every-algochat-library
artifact: context
---

# Context

The release checklist left Kotlin coordinates, the Go module path, the Swift package name, and REPO-2 unresolved. The owner decided CorvidLabs/algochat is the source for every library. Archived repositories stay archived.

The Go module path changes from `github.com/CorvidLabs/go-algochat` to `github.com/CorvidLabs/algochat/go` so `go get` resolves inside this repository. The Swift package name changes from `swift-algochat` to `algochat`, matching the product import already shown to app authors. Kotlin stays `com.corvidlabs:kt-algochat:0.2.0`. The README had advertised `com.corvidlabs:algochat:0.2.0`.
