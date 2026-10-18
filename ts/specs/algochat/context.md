---
spec: algochat.spec.md
---

## Context

AlgoChat applications need one interoperable TypeScript package for account material, authenticated message envelopes, on-chain transport, history reconstruction, offline delivery, and optional PSK defense-in-depth. The implementation deliberately separates injectable blockchain boundaries from deterministic protocol logic.

## Design Decisions

- Use fresh X25519 ephemeral keys and ChaCha20-Poly1305 for standard messages.
- Add PSK material through HKDF rather than replacing ECDH, retaining two independent inputs to the symmetric key.
- Keep the wire format within the Algorand 4096-byte note limit. Plaintext maxima are that limit minus the header minus the 16-byte tag.
- Price a payment note with `notePaymentFee`: Falcon-1024 pays `minFee * 3`, Ed25519 pays `minFee`, and bytes past 1024 add the consensus surcharge.
- Treat public-chain metadata exposure as an explicit limitation, not a security property.
- Keep clients and storage interfaces injectable for offline deterministic tests.
- Sign payments through `ChatAccount.txnSigner` so Falcon-1024 `pqsig` and Ed25519 `sig` share one send path.
- Derive X25519 keys from mnemonic entropy, never from a Falcon secret-key prefix.
- Default new accounts to Falcon-1024; keep mnemonic import Ed25519 unless the caller passes a scheme.
- Deliver envelopes only as encrypted payment notes. Do not include a raven mailbox router or other dead-drop transport.

## Current implementation inventory

The module also owns header-AAD helpers and low-level hybrid X25519 + ML-KEM-768 key announcements, handshakes and session-data helpers in `src/pq/`. Standard/PSK writers use version `0x02`; readers preserve version `0x01` compatibility. The service/indexers do not route the counter-bearing PSK or hybrid protocols. Managed PSK counters are pure functions: the package does not persist them, and exhaustion is a flag on the returned state. History for the exported indexer, the abstract indexer, and `Conversation` follows confirmed round then intra-round offset. Note-facing opens reject a note longer than 4096 bytes before plaintext. Module coverage and the root qualification evidence do not establish complete accepted-contract behavior; see the [accuracy ledger](../../../docs/ACCURACY.md).
