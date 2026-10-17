---
change: CHG-0006-add-an-opt-in-mailboxroutertransport-speaking-the-raven-mailbox-protocol-per-co
artifact: plan
---

# Plan

1. **`src/blockchain/mailbox.ts`** — pure protocol module: constants, typed
   errors, `deriveMsgKey`, `deriveMailboxId`, `mailboxMbr`, `planMailboxPut`,
   `planMailboxFanout`, `MAILBOX_METHODS`, `mailboxMethodSelector`.
2. **`src/blockchain/mailbox.test.ts`** — known-answer tests against
   `node:crypto`, published MBR table, validation rejections, selector
   cross-check against `algosdk.ABIMethod`.
3. **`src/services/mailbox-router.service.ts`** — `MailboxRouterTransport`
   (send, sendFanout, burn, reclaim, read) over an injected algod client.
4. **`src/services/mailbox-router.service.test.ts`** — stub algod capturing
   submitted bytes; decode and assert group shape, amounts, ABI args, box
   refs; opt-in and read-path behavior.
5. **`src/services/algorand.service.ts`** — optional `mailboxAppId` config;
   expose `service.mailbox` only when configured.
6. **`src/index.ts`** — export the new symbols from deep paths (barrels
   untouched, per affected-path scope).
7. Run the fledge verify lane (type-check, build, full Bun suite).
8. SpecSync verify → accept with evidence; semantic delta applies
   REQ-algochat-021…023 to the canonical spec.

Rollback: the change is additive; reverting the branch removes the feature
without touching existing behavior.
