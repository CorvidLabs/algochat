---
spec: psk.spec.md
---

## Test Plan

### Unit Tests

- Run `PSKTest` for known-answer derivations, counter boundaries, replay and rollback behavior, envelope layout, note ceiling, hybrid authentication, and exchange URI validation.

### Integration Tests

- Exercise sender-to-recipient and sender-history round trips with independent state instances and tampered inputs.
