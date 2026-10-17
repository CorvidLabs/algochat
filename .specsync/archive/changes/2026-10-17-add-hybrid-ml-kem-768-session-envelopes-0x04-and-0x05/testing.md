---
change: add-hybrid-ml-kem-768-session-envelopes-0x04-and-0x05
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| REQ-protocol-1 | `ts/src/pq/pq.test.ts` covers the handshake, the 0x05 round trip, tamper, and the pinned combiner. `bun test` in ts covers 0x01 and 0x02 as well. |
