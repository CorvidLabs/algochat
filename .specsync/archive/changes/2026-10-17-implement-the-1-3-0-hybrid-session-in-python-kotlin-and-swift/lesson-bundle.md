# Lesson bundle — implement-the-1-3-0-hybrid-session-in-python-kotlin-and-swift

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Implement the 1.3.0 hybrid session in Python, Kotlin, and Swift
- **Kind**: Feature
- **Paths**: py, kt, swift, Package.swift, PARITY.md, README.md, implementations.json
- **Acceptance**: Python, Kotlin, and Swift each open the TypeScript handshake fixture and the LocalNet note, recover the same session key, and still pass their existing 0x01 and 0x02 tests.

## Evidence

- Verification commit: `0ba461c5a1d4f1eeecb8907e9818543befc60f5d`
- Base commit: `9e044821ea208dce87d04025274d57b769d88359`
- Verified by: `specsync check (no spec in scope)`

## From the change's context.md

# Context

TypeScript, Go, and Rust already open the same 0x04 handshake. Python, Kotlin, and Swift still speak only 0x01 and 0x02. ENCRYPT-2 asks for a post-quantum message when both people have published a post-quantum key.

## From the change's design.md

# Design

Each library follows ts/src/pq and PROTOCOL.md section 5.7. The ML-KEM seed is d||z from HKDF-SHA256. Swift uses swift-crypto MLKEM768. Kotlin uses BouncyCastle ML-KEM-768. Python uses a FIPS 203 library that accepts that seed.

## From the change's testing.md

# Testing

pytest in py, ./gradlew test in kt, and swift test from the repository root. Each new test reads vectors/pq-mlkem768.json. The LocalNet capture at /tmp/pq-live.json is checked when the file is present.

## Where these lessons go

This change declared no affected specs, so there is no module context to fold into.
