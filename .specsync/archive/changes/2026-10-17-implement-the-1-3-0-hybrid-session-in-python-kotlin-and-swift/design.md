---
change: implement-the-1-3-0-hybrid-session-in-python-kotlin-and-swift
artifact: design
---

# Design

Each library follows ts/src/pq and PROTOCOL.md section 5.7. The ML-KEM seed is d||z from HKDF-SHA256. Swift uses swift-crypto MLKEM768. Kotlin uses BouncyCastle ML-KEM-768. Python uses a FIPS 203 library that accepts that seed.
