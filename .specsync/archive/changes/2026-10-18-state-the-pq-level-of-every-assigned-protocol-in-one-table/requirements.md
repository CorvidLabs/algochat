---
change: state-the-pq-level-of-every-assigned-protocol-in-one-table
artifact: requirements
---

# Requirements

REQ-protocol-3 makes PROTOCOL.md section 5.4.2 the only PQ-level statement. Everyday `0x01` is X25519 only. Extra lock `0x02` still needs the pre-shared key after a break of X25519. Hybrid `0x04` and `0x05` need both X25519 and ML-KEM-768. `0x03` stays unassigned. A future group key wrap must meet the Extra lock level or the hybrid level.
