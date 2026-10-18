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
- Protocol revision 1.2.1 raises the note ceiling to 4096 bytes without a new envelope version byte. Standard header stays 126 bytes plus a 16-byte tag. PSK envelopes are implemented in `psk.go`, with a 130-byte header and 3950-byte plaintext maximum; callers own replay state. There is no Falcon signer, so note fees use one minimum fee plus the surcharge.

## Current inventory and verification boundaries

`pq.go` implements hybrid X25519 + ML-KEM-768 handshakes, session data and announcement parsing; `cmd/pqcross/main.go` is the fixture adapter. Standard/PSK writers emit version `0x01` while readers also accept `0x02` with header AAD. The active root qualification runs Go 1.25 ordinary tests/build, fixture checks and a consumer check. The module Fledge verification lane separately defines vet and race-enabled tests. The former nested standalone matrix does not execute from this monorepo location. Historical accepted requirements remain visible; see [implementation gaps](../../../docs/ACCURACY.md).
