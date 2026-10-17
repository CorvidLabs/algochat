---
change: remove-the-raven-mailbox-router-transport-and-keep-algochat-as-encrypted-note-messaging-with-falcon-1024-post-quantum
artifact: plan
---

# Plan

1. Delete `src/blockchain/mailbox.ts`, `src/blockchain/mailbox.test.ts`,
   `src/services/mailbox-router.service.ts`, and
   `src/services/mailbox-router.service.test.ts`.
2. Remove mailbox exports from `src/index.ts`.
3. Remove `mailboxAppId` / `mailbox` from `AlgorandService`.
4. Keep Falcon-1024 create/import/sign behavior. Guard Falcon fee
   calculation when `minFee` is absent. Add offline tests that Falcon
   `sendMessage` emits `pqsig` at ≥ 3× minFee and Ed25519 still emits `sig`.
5. Drop REQ-algochat-021…023. Add REQ-algochat-025 (encrypted notes only,
   no raven mailbox). Update Public API, invariants, companions, README if
   needed.
6. Run `bun test`, `fledge lanes run verify`, `specsync check --spec algochat`,
   and `fledge trust verify`.
