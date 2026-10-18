---
spec: client.spec.md
---

## Test Plan

### Unit Tests

- Run `AlgoChatTest`, `BlockchainTest`, `ModelsTest`, `QueueTest`, and `StorageTest` for deterministic model, discovery, queue, and persistence behavior.

### Integration Tests

- Run `AlgoChatClientTest` with deterministic in-memory transport test doubles to verify seeded identity, discovery, send/fetch composition, and conversation updates.

## Evidence limits

`AlgoChatClientTest` rejects an address that does not match the seed, including the Ed25519 address of a Falcon client. Model and cache tests order by confirmed round then intra-round offset and page across a same-round boundary. Storage tests still cover encryption-key persistence, which remains outside the no-private-key-persistence requirement.
