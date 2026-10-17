---
spec: algochat.spec.md
---

## Context

The repository is an early Go implementation of the AlgoChat protocol. Its tested cryptographic, envelope, queue, model, and storage primitives are public, while the high-level blockchain client remains explicitly unfinished. Governance must preserve that distinction.

## Related Modules

- The cross-language AlgoChat protocol and its version-one wire format.

## Design Decisions

- Keep protocol and cryptographic behavior grounded in package tests.
- Use race-enabled tests to protect concurrent queue and cache behavior.
- Do not expand migration scope into the planned high-level client.
- Protocol revision 1.2.1 raises the note ceiling to 4096 bytes without a new envelope version byte. Standard header stays 126 bytes plus a 16-byte tag. PSK envelopes are not implemented here. There is no Falcon signer, so note fees use one minimum fee plus the surcharge.
