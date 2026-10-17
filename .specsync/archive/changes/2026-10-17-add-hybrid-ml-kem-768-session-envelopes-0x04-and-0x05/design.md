---
change: add-hybrid-ml-kem-768-session-envelopes-0x04-and-0x05
artifact: design
---

# Design

Section 5.7 of PROTOCOL.md. TypeScript in ts/src/pq uses @noble/post-quantum ML-KEM-768 and the HKDF combiner pinned in TEST-VECTORS.md. Other languages follow that vector in later commits of this release.
