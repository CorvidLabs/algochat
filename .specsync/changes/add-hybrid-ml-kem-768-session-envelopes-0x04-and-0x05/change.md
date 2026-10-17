---
id: add-hybrid-ml-kem-768-session-envelopes-0x04-and-0x05
state: implementing
type: feature
base_commit: 69ed4d66251348eff02833f5d2c68f73e5723cec
---

# Add hybrid ML-KEM-768 session envelopes 0x04 and 0x05

## Intent

Add hybrid ML-KEM-768 session envelopes 0x04 and 0x05

## Affected Canonical Specs

- `protocol`

## Acceptance Criteria

- TypeScript can announce an ML-KEM key, complete a 1278-byte handshake, and decrypt a 0x05 message. The pinned combiner vector matches TEST-VECTORS.md. 0x01 and 0x02 tests still pass.

## No-spec Rationale

Protocol 1.3.0 adds an optional hybrid session. 0x01 and 0x02 stay. 0x03 is not assigned.
