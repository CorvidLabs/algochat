---
spec: psk.spec.md
---

## Context

The PSK variant adds an out-of-band secret and ratchet position to the normal asymmetric envelope while retaining sender/recipient history decryption.

## Related Modules

- `protocol` owns common keys and cryptographic conventions.
- `cross-vectors` guards portable wire and derivation behavior.

## Design Decisions

- A distinct protocol id enables unambiguous dispatch.
- A bounded receive window tolerates limited reordering while rejecting replay.
- Receive state commits only after the supplied decrypt block succeeds.
- PSK plaintext max is 4096 minus the 130-byte header and 16-byte tag.
