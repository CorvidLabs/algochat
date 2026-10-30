---
change: python-bot-reads-one-to-one-messages-and-replies-by-itself
artifact: research
---

# Research

An Algorand payment's transaction id is base32 of SHA-512/256 over `"TX"` plus the canonical msgpack of its fields (sorted keys, zero and empty values left out). The signed form is `{"sig": <64 bytes>, "txn": {...}}`. Vectors for two payments (a short note and a 1200-byte note with a fee surcharge) were computed with `py-algorand-sdk` and are fixed in `py/tests/test_transaction.py`.

On localnet (indexer 3.11.1), `GET /v2/transactions?address=...` lists newest first and returns a `next-token` when more remain; `min-round` does not change that order. Every implementation's read path already parses the section 9.2 reply payload and returns its text: checked on localnet with the TypeScript, Go, Rust, Python and Kotlin tools and the Swift recorded-notes test.
