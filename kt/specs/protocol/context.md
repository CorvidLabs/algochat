---
spec: protocol.spec.md
---

## Context

AlgoChat messages are Algorand transaction-note bytes, so the encoded envelope and cryptographic context must remain byte-for-byte compatible across languages.

## Related Modules

- `client` supplies transport and application state.
- `psk` reuses the key and AEAD foundations with a distinct protocol id.
- `cross-vectors` verifies sibling implementation fixtures.

## Design Decisions

- Sender-key wrapping lets both sender and recipient decrypt sent history.
- The version/protocol prefix permits safe dispatch before full decoding.
- Structured JSON payloads retain a legacy UTF-8 decoding fallback.
- The note ceiling is 4096 bytes. Standard plaintext max is that ceiling minus the 126-byte header and 16-byte tag.
- A hybrid session is optional. Its handshake and message notes use their own header version and protocol bytes, and an ACPQ announcement is not an X25519 key.

## Accuracy audit

The PQ public export index covers the existing `PQ.kt` API, constants, data classes, properties, and operations. No new protocol behavior is implied. Fingerprints use eight SHA-256 bytes formatted as uppercase groups, as implemented by `Signature.fingerprint`.
