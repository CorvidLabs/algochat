---
spec: protocol.spec.md
---

## Key Decisions

- Preserve version 1 empty-AAD compatibility.
- Require version 2 to authenticate its 126-byte header.
- Derive X25519 keys deterministically from exact 32-byte seed material.
- Sign published X25519 keys with the account Ed25519 identity.

## Files to Read First

- src/types.rs and src/envelope.rs define the standard wire contract.
- src/crypto.rs defines sender/recipient encryption and payload decoding.
- src/keys.rs and src/signature.rs define identity primitives.

## Current Status

- Versions 1 and 2 are active. Protocol revision 1.2.1 raises the note ceiling to 4096 bytes. This is not protocol 1.3 and adds no new version byte.

## Notes

- specs/proposals/0001-aead-header-binding-and-identity-verification.md explains v2.

## Accuracy audit

The active implementation authenticates the full standard/PSK payload headers (126/130 bytes), including the wrapped sender key. Sender-key wrapping uses empty AAD. Prefix-only wording in proposal 0001 is historical and is superseded by the active implementation and canonical contract; no runtime interoperability change is part of this correction.

The protocol source inventory includes `src/pq.rs`, covering the shipped low-level ML-KEM session exports separately from high-level client dispatch. See the [accuracy ledger](../../../docs/ACCURACY.md).
