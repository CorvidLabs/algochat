---
spec: algochat.spec.md
---

## Context

Python AlgoChat is one implementation of a shared encrypted messaging protocol. Its wire encodings, cryptographic construction, PSK ratchet rules, and fixtures must remain compatible with the sibling Swift, Rust, TypeScript, and Kotlin implementations.

Notes may be 4096 bytes. The standard header stays 126 bytes and the PSK header stays 130 bytes, with a 16-byte Poly1305 tag, so plaintext maxima are 3954 and 3950 bytes. A note payment fee is one minimum fee plus the consensus surcharge for bytes past 1024. This library does not sign with Falcon.

## Accuracy audit

The canonical source inventory now includes `src/algochat/pq.py` and all 29 PQ root exports. PQ is a low-level session API, independent of high-level standard-message transport. `cryptography>=50` is required for ML-KEM seed import. Legacy sibling fixtures remain optional; committed PQ vectors are a separate deterministic evidence source.

PSK receive helpers are separate pure functions. Callers persist the returned state object. Before any receive, counters 0 through 200 are accepted and 1000000 is rejected. After the highest accepted counter, the window is 200 in both directions. Issuing 4294967295 exhausts sending without wrapping to 0, and that flag survives pickle. Negative, fractional, non-integer, and oversized counters are rejected before 4-byte encoding. Standard decode requires 142 bytes and PSK decode requires 146. Note-facing opens reject input longer than 4096 bytes before returning plaintext.
