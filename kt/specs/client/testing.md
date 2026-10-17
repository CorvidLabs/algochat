---
spec: client.spec.md
---

## Test Plan

### Unit Tests

- Run `AlgoChatTest`, `BlockchainTest`, `ModelsTest`, `QueueTest`, and `StorageTest` for deterministic model, discovery, queue, and persistence behavior.

### Integration Tests

- Run `AlgoChatClientTest` with deterministic in-memory transport test doubles to verify seeded identity, discovery, send/fetch composition, and conversation updates.
