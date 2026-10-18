---
change: document-package-versions-and-language-runtime-requirements-for-all-six-algochat-libraries
artifact: docs
---

# Docs

The root README lists Swift 1.3.0, TypeScript 0.9.0, Python 0.2.0, Rust 0.3.0, Kotlin 0.2.0, and Go 0.2.0 alongside package names and declared toolchain versions.

Each language README states its source version, protocol 1.3.0, relevant compiler/runtime requirements, and qualification limits. Source-version badges and CI links refer to this monorepo. Versioned installation examples use the declared release versions; Python source installation selects the monorepo's py subdirectory.

docs/RELEASE.md distinguishes declared minima from configured CI tools, including Bun 1.3.6, Node 22, Python 3.12, Kotlin 2.1.20, JDK 17, Gradle wrapper 8.11/external consumer 8.14, and Go 1.25. Rust and Swift compiler versions remain runner observations rather than invented pins. docs/HLD.md links to these matrices and distinguishes protocol, envelope, and package versions.

The documentation identifies Swift's declared Apple platform minima and OS 26 availability for hybrid methods; qualification covers macOS 26 and Linux without ML-KEM. It preserves unqualified minimum-runtime gaps and makes no new registry publication or candidate-pass claim.
