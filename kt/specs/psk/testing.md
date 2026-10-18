---
spec: psk.spec.md
---

## Test Plan

### Unit Tests

- Run `PSKTest` for known-answer derivations, counter boundaries, replay and rollback behavior, envelope layout, note ceiling, hybrid authentication, and exchange URI validation.

### Integration Tests

- Exercise sender-to-recipient and sender-history round trips with independent state instances and tampered inputs.

## Evidence limits

The receive-wrapper rollback/replay tests cover mutex-protected validate/decrypt/record. `PSKTest` also rejects a fresh counter of `1000000`, keeps `0` rejected after `UInt.MAX_VALUE`, and refuses a second send after that maximum. Decoder tests reject 145-byte PSK frames and notes longer than 4096 bytes.
