---
change: CHG-0006-add-an-opt-in-mailboxroutertransport-speaking-the-raven-mailbox-protocol-per-co
artifact: tasks
---

# Tasks

- [x] Implement pure mailbox protocol module (derivation, MBR, planning, selectors, errors)
- [x] Add known-answer and validation tests for the pure module
- [x] Implement MailboxRouterTransport (send, sendFanout, burn, reclaim, read)
- [x] Add stub-algod transport tests (group shape, ABI args, box refs, opt-in)
- [x] Wire opt-in `mailboxAppId` into AlgorandService config
- [x] Export new public symbols from src/index.ts
- [x] Write semantic delta adding REQ-algochat-021…023 to the algochat spec
- [x] Pass the fledge verify lane (type-check, build, full Bun suite)
- [x] Record SpecSync verification and acceptance evidence
