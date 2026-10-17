---
change: CHG-0003-correct-and-complete-the-go-algochat-canonical-contract-for-full-implementation
artifact: context
---

# Context

The initial migration companion associated only `doc.go` with a contract that described the entire package. That left the implemented cryptography, wire codec, signatures, account constructors, models, queue, and storage outside SpecSync coverage, while workflow behavior was only partially documented. One invariant also stated that decoding rejected oversized plaintext even though the size limit is enforced only when encrypting plaintext.

This correction documents the behavior already implemented and exercised by the repository's tests. It changes governance and specification files only; no Go implementation or public API changes are in scope.
