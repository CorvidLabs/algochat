---
change: room-administration-reducer-and-action-5-key-delivery
artifact: testing
---

# Testing

REQ-algochat-026 is covered by ts/src/pq/group-admin.test.ts, which loads vectors/group-admin-v1.json. src/pq/group.test.ts still opens vectors/group-v1.json. `bunx tsc --noEmit` must pass.
