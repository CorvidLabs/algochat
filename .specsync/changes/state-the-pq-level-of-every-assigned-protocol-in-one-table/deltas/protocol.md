## Added

### REQUIREMENT REQ-protocol-3

PROTOCOL.md section 5.4.2 SHALL be the post-quantum level of every assigned protocol. Everyday `0x01` SHALL be recorded as X25519 only. Extra lock `0x02` SHALL be recorded as still requiring the pre-shared key after a break of X25519, while that key stays secret. Hybrid `0x04` SHALL be recorded as requiring both the X25519 shared secret and the ML-KEM-768 shared secret. Hybrid `0x05` SHALL be recorded as the same level as its handshake, and the session key SHALL open every `0x05` note in that handshake. Identifier `0x03` SHALL NOT be assigned. A future group key wrap SHALL meet the Extra lock level or the hybrid level. A wrap that is only everyday `0x01` does not meet that bar.

#### Acceptance Criteria

- Section 5.4.2 names `0x01`, `0x02`, `0x04`, `0x05`, and unassigned `0x03`.
- SECURITY.md and the repository README point at that section.
- No assigned protocol is given a second, conflicting PQ level.
