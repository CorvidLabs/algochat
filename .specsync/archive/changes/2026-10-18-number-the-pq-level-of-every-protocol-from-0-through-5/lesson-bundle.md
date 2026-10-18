# Lesson bundle: number-the-pq-level-of-every-protocol-from-0-through-5

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Number the PQ level of every protocol from 0 through 5
- **Kind**: Documentation
- **Specs**: protocol
- **Paths**: PROTOCOL.md, SECURITY.md
- **Acceptance**: Section 5.4.2 defines PQ levels 0 through 5. Everyday is 0. Extra lock is 1 while the 32-byte PSK stays secret. Hybrid handshake and message are 3. Levels 2, 4, and 5 are unused by a message protocol. 0x03 stays unassigned. README and SECURITY.md use those integers.

## Evidence

- Verification commit: `def2c7595f5569183237ccb0cbfcf15cb5784112`
- Base commit: `629a29ce8c9a0c5cd64a60936399e80a2a4aaaee`
- Verified by: `specsync check --spec protocol`

## From the change's context.md

# Context

The first PQ-level section described each protocol in prose. Readers need a stable integer. Levels 1 through 5 are the NIST categories. Level 0 is the case NIST does not number: Shor breaks the key exchange and no PQC primitive is required.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| REQ-protocol-3 | PROTOCOL.md section 5.4.2 defines levels 0 through 5. `0x01` is 0, `0x02` is 1, and `0x04` and `0x05` are 3. README and SECURITY.md use those integers. |

## Where these lessons go

- `specs/protocol/context.md`
