## MODIFIED

### REQUIREMENT REQ-protocol-8

TypeScript SHALL draft delta `0x03` notes that omit the member list, SHALL still reduce full-list notes from `vectors/group-admin-v1.json`, and SHALL accept 256 members. A full-list note of 256 members SHALL be rejected as too large. A channel SHALL be a separate room whose notes name the parent room's group id. The group owner creates and owns the channel. Membership in the parent SHALL NOT by itself add a member to the channel. Key deliveries SHALL be separate payments, at most 16 at a time, and a landed payment SHALL be kept so a missed recipient can be resumed. Other ports MUST NOT emit a different delta layout.

Acceptance Criteria
- `ts/src/pq/group-admin.test.ts` rejects a 256-member full list as too large and folds a delta room from 1 member through 256.
- `ts/src/pq/group-admin.test.ts` matches `vectors/group-admin-delta-v1.json` and still reduces `vectors/group-admin-v1.json`.
- A channel note points at the parent group id, and a parent member who was not added is absent from the channel.
- `vectors/group-admin-v1.json` bytes are unchanged.
