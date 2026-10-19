---
change: release-protocol-1-4-0-and-the-library-versions
artifact: testing
---

# Testing

REQ-release-5: `docs/RELEASE.md` names tag `v1.4.0`, TypeScript `0.10.0`, Python `0.3.0`, Rust `0.4.0`, Kotlin `0.3.0`, and Go tag `go/v0.3.0`. `scripts/release/packages.py` expects the Kotlin POM `com.corvidlabs:kt-algochat:0.3.0`. `python3 -m unittest discover -s scripts/release -v` passed 25 tests.
