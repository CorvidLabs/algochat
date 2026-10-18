---
spec: psk.spec.md
---

## Requirements

### REQ-psk-001 — Hybrid encryption

PSK encryption SHALL combine ephemeral ECDH and the counter-derived PSK through HKDF-SHA256 and SHALL support sender and recipient decryption.

### REQ-psk-002 — Deterministic ratchet

Equal initial PSKs and counters SHALL produce equal session, position, and current PSKs across implementations.

### REQ-psk-003 — V2 counter binding

Version 2 SHALL authenticate the exact 130-byte full header, including the ratchet counter, so header or downgrade tampering fails.

### REQ-psk-004 — Replay protection

Receive state SHALL reject duplicate counters and counters outside a 200-counter window in either direction before returning plaintext, SHALL reject counter 1000000 on a fresh state, and SHALL prune obsolete replay history. Accepting `u32::MAX` SHALL NOT make counter 0 acceptable. Failed authentication SHALL NOT record a counter or move the window. `advance_send_counter` SHALL return `u32::MAX` once and then fail without storing 0. Exhaustion SHALL survive serde.

### REQ-psk-005 — Exchange URI validity

Exchange URIs SHALL require the algochat-psk://v1 form, peer address, and exact 32-byte base64url PSK while round-tripping optional labels.

## Acceptance Criteria

- Member-level validation covers every PSK symbol.
- Unit and cross-vector tests cover ratchet answers, v1/v2 roundtrips, replay, URI parsing, and tamper.

## Constraints

- The 3950-byte maximum preserves the 4096-byte Algorand note ceiling. An 878-byte plaintext still encrypts.
- Version 1 remains decodable and counter state remains serializable.

## Out of Scope

- Contact persistence and synchronized orchestration are owned by client.
- Standard envelopes and shared errors are owned by protocol.

### REQ-psk-001

PSK encryption SHALL combine ephemeral ECDH and counter-derived PSK material.

Acceptance Criteria
- Hybrid encryption tests pass for sender and recipient.

### REQ-psk-002

Equal initial PSKs and counters SHALL derive equal ratchet material.

Acceptance Criteria
- Ratchet known-answer tests pass.

### REQ-psk-003

Version 2 SHALL authenticate the exact 130-byte PSK header including its counter.

Acceptance Criteria
- PSK known-answer and tamper vectors pass.

### REQ-psk-004

Receive state SHALL reject duplicate and out-of-window counters before returning plaintext, including a fresh counter of 1000000 and counter 0 after `u32::MAX`. Send exhaustion SHALL NOT wrap to 0.

Acceptance Criteria
- Replay and window tests pass.

### REQ-psk-005

Exchange URIs SHALL validate scheme, version, address, and exact 32-byte PSK material.

Acceptance Criteria
- URI roundtrip and malformed-input tests pass.

