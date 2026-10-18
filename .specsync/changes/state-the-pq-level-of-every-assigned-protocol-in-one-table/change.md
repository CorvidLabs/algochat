---
id: state-the-pq-level-of-every-assigned-protocol-in-one-table
state: implementing
type: documentation
base_commit: 237a97488ac663fdf326e07badc383b4452db4ad
---

# State the PQ level of every assigned protocol in one table

## Intent

State the PQ level of every assigned protocol in one table

## Affected Canonical Specs

- `protocol`

## Acceptance Criteria

- PROTOCOL.md section 5.4.2 is the only PQ-level table. Everyday 0x01 is X25519 only. Extra lock 0x02 still needs the PSK after a break of X25519. Hybrid 0x04 and 0x05 need both X25519 and ML-KEM-768. 0x03 stays unassigned. A future group wrap must meet the Extra lock level or the hybrid level. SECURITY.md, the README, PARITY.md, and the six language READMEs point at that section.

## No-spec Rationale

Not applicable
