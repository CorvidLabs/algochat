# Lesson bundle — state-the-pq-level-of-every-assigned-protocol-in-one-table

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: State the PQ level of every assigned protocol in one table
- **Kind**: Documentation
- **Specs**: protocol
- **Paths**: PROTOCOL.md, SECURITY.md
- **Acceptance**: PROTOCOL.md section 5.4.2 is the only PQ-level table. Everyday 0x01 is X25519 only. Extra lock 0x02 still needs the PSK after a break of X25519. Hybrid 0x04 and 0x05 need both X25519 and ML-KEM-768. 0x03 stays unassigned. A future group wrap must meet the Extra lock level or the hybrid level. SECURITY.md, the README, PARITY.md, and the six language READMEs point at that section.

## Evidence

- Verification commit: `789e7acd8144d4c60402aa1ca06e8afdd9ebc412`
- Base commit: `237a97488ac663fdf326e07badc383b4452db4ad`
- Verified by: `specsync check --spec protocol`

## From the change's context.md

# Context

The protocol ids were listed in several documents without one shared statement of the post-quantum level. Everyday chat, Extra lock, and the hybrid session do not have the same level. A future group wrap has to be held to the Extra lock level or the hybrid level, not to everyday X25519 alone.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| REQ-protocol-3 | PROTOCOL.md section 5.4.2 names `0x01`, `0x02`, `0x04`, `0x05`, and unassigned `0x03`. SECURITY.md, the README, PARITY.md, and the six language READMEs link to that section. |

## Where these lessons go

- `specs/protocol/context.md`
