---
change: CHG-0002-replace-the-incomplete-no-spec-rationale-with-a-stable-full-library-algochat-con
artifact: research
---

# Research

The audit covers the standard X25519 and ChaCha20-Poly1305 envelope, Ed25519 key
announcements, the PSK v1.1 hybrid ratchet and replay window, Algorand note
transactions and indexing, account helpers, conversation assembly, offline
queueing, synchronization, caches, encrypted file storage, and typed errors.
The README correctly disclaims address, timing, and traffic-analysis privacy.
Tests use deterministic clients and fixtures rather than live network mutation.
