---
spec: algochat.spec.md
---

## Key Decisions

- Standard mode uses a fresh X25519 ephemeral key per message and authenticated encryption. That separates message keys. It does not provide forward secrecy.
- PSK mode is optional defense-in-depth. It adds a deterministic ratchet and replay window without replacing authenticated ECDH. Accepted transaction ids are stored with the counters, so reading the same transaction again is not a replay. The send counter does not wrap.
- Transaction notes are the immutable transport; the indexer is the read/discovery plane and local caches are accelerators, not authorities.
- Durable queues and platform-specific key storage sit behind async `Sendable` protocols so applications can substitute implementations.

## Files to Read First

- `Sources/AlgoChat/AlgoChat.swift` for client orchestration.
- `Sources/AlgoChat/Models/ChatEnvelope.swift` and `PSKEnvelope.swift` for wire formats.
- `Sources/AlgoChat/Crypto/MessageEncryptor.swift` and `PSKRatchet.swift` for cryptographic behavior.
- `Sources/AlgoChat/Blockchain/MessageTransaction.swift` and `MessageIndexer.swift` for transport and discovery.
- `Sources/AlgoChat/Queue/SendQueue.swift` and `SyncManager.swift` for offline delivery.

## Current Status

The root package declares Swift tools 6.0 and source release 1.3.0. Active root qualification runs full package tests/build on macOS 26+ and Linux, then checks exported sources and a separate consumer. The module-local Fledge lane retains filtered crypto/unit batches and a CLI build; fixed counts from the governance migration are historical. LocalNet remains environment dependent. Hybrid ML-KEM methods require Apple OS 26 and are omitted on Linux; their non-ML-KEM helpers remain available.

## Operational Notes

The project is not independently audited. Consumers should treat key material, PSKs, transaction permanence, and public-chain metadata according to the threat model in `SECURITY.md`.

## Current implementation limits

The canonical inventory now includes `Crypto/PQSession.swift` and `Sources/PQCross/main.swift`. Hybrid sessions remain low-level helpers separate from client/indexer routing. Current behavior and unmet accepted requirements are recorded in the [accuracy ledger](../../../docs/ACCURACY.md), including inbound size checks and unsupported-platform Keychain fallback.
