---
spec: psk.spec.md
---

## Key Decisions

- Combine current PSK material with ephemeral ECDH through HKDF-SHA256.
- Divide counters into deterministic sessions of 100 positions.
- Retain a 200-counter receive window with explicit replay tracking.
- Authenticate the counter and header only in version 2 while preserving v1.

## Files to Read First

- src/psk_types.rs and src/psk_envelope.rs define the wire contract.
- src/psk_crypto.rs and src/psk_ratchet.rs define key use and derivation.
- src/psk_state.rs and src/psk_exchange.rs define replay and sharing boundaries.

## Current Status

- PSK versions 1 and 2 are active. The plaintext maximum is 3950 bytes under the 4096-byte note ceiling (protocol revision 1.2.1, not 1.3).

## Notes

- Proposal 0001 governs v2 AEAD header binding.

## Implementation and contract gaps

Version 2 payload AAD is the full 130-byte header, including the wrapped sender key; wrapping itself uses empty AAD. Current send counters use wrapping arithmetic and receive validation accepts arbitrarily advanced counters. Counter exhaustion and stronger bounded-window intent remain open implementation work rather than being silently relaxed. See the [accuracy ledger](../../../docs/ACCURACY.md).
