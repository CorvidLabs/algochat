---
change: room-administration-reducer-and-action-5-key-delivery
artifact: plan
---

# Plan

## Approach

Keep the reducer in src/pq/group-admin.ts and the legacy 0x06 and 0x07 notes in src/pq/group.ts. Export the administration API from src/pq/index.ts.

## Out of scope

Raven UI and a room directory.

## Steps

1. Add the source files to the algochat spec.
2. Lock behavior to vectors/group-admin-v1.json.
3. Expose adminDraft, adminReduce, deliverSeal, and deliverOpen on scripts/pq-io.ts.

## Risks

A typecheck must accept both joining rules. The create helper parameter is a number, not the invite-only literal.

## Constraints consulted

The 4096-byte note limit and the public-metadata lesson in specs/algochat/context.md.
