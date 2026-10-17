---
spec: client.spec.md
---

## Context

The client composes the wire-level primitives into application-facing coroutine APIs while keeping network transport and persistence replaceable.

## Related Modules

- `protocol` owns encryption, envelope, signature, and payload rules.
- `psk` owns the optional pre-shared-key transport.

## Design Decisions

- Algod, indexer, and storage are interfaces so tests and host applications control I/O.
- Mutable conversation and queue state is protected with coroutine mutexes.
- Verified and merely discovered keys remain distinguishable to callers.
