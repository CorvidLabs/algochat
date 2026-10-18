# Lesson bundle — room-administration-reducer-and-action-5-key-delivery

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Room administration reducer and action-5 key delivery
- **Kind**: Feature
- **Specs**: algochat
- **Paths**: src/pq/group-admin.ts, src/pq/group-admin.test.ts, src/pq/index.ts, src/pq/group.ts, src/pq/session.ts, specs/algochat/algochat.spec.md, ts/specs/algochat/algochat.spec.md, ts/specs/algochat/requirements.md
- **Acceptance**: ts/src/pq/group-admin.test.ts matches vectors/group-admin-v1.json, including rejected reasons, delivery authorization, and the 227-byte action-5 note. Legacy group tests still open vectors/group-v1.json.

## Evidence

- Verification commit: `6d2c88dec6b839773a8c54ceea41c78431e4df33`
- Base commit: `d71341d1cc6e2f43fd49ddb47d902a0741048d11`
- Verified by: `specsync check --spec algochat`

## From the change's context.md

# Context

The TypeScript package is the reference reducer for protocol 0x03 and the 0x06 action-5 key delivery. vectors/group-admin-v1.json is generated from this reducer. The other five libraries match those bytes.

Notes stay within 4096 bytes. Member addresses are public because they are on the administration record and on the payment. Legacy group notes stay readable.

## From the change's design.md

# Design

`reduceAdmin` sorts by round, offset, then transaction id. A repeated transaction id is a replay. A join request does not advance `headTxId`. Other operations must name the current head. The note's public roster must equal the only legal next state. Pending requests stay off the wire.

## From the change's testing.md

# Testing

REQ-algochat-026 is covered by ts/src/pq/group-admin.test.ts, which loads vectors/group-admin-v1.json. src/pq/group.test.ts still opens vectors/group-v1.json. `bunx tsc --noEmit` must pass.

## Where these lessons go

- `specs/algochat/context.md`
