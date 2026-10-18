---
spec: client.spec.md
---

## Test Plan

### Unit Tests

- Run `AlgoChatTest`, `BlockchainTest`, `ModelsTest`, `QueueTest`, and `StorageTest` for deterministic model, discovery, queue, and persistence behavior.

### Integration Tests

- Run `AlgoChatClientTest` with deterministic in-memory transport test doubles to verify seeded identity, discovery, send/fetch composition, and conversation updates.

## Evidence limits

Seeded-construction tests pass caller-provided addresses and do not establish address derivation/seed matching. Model tests exercise current timestamp ordering, not a complete round/intra-round tie-break contract. Storage tests explicitly cover encryption-key persistence. These limits must not be described as proof that the stronger identity/order/persistence requirements are satisfied.
