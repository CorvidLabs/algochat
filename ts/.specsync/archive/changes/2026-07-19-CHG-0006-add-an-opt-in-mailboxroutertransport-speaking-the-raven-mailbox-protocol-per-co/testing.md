---
change: CHG-0006-add-an-opt-in-mailboxroutertransport-speaking-the-raven-mailbox-protocol-per-co
artifact: testing
---

# Testing

All tests are deterministic and offline (canonical constraint: no credentials,
wallets, or public-network mutation).

## Pure module — `src/blockchain/mailbox.test.ts`

- **Known-answer derivation:** `deriveMsgKey` / `deriveMailboxId` checked
  byte-for-byte against an independent `node:crypto` implementation across
  several secrets and counters, including counter 0 and 2³²−1.
- **Determinism and rotation:** same inputs → same outputs; different
  counters → different msg_keys; different secrets → different ids.
- **MBR table:** 560 B → 255,300; 878 B → 382,500; 2048 B → 850,500 µALGO
  (matches the raven implementation-verified table).
- **Validation:** wrong-length view secrets and msg keys, non-integer and
  out-of-range counters, empty and 2049-byte envelopes, fan-out of 0 and 9
  legs — each rejected with its typed error.
- **Selectors:** `mailboxMethodSelector` output equals
  `new algosdk.ABIMethod(...).getSelector()` for all four methods.

## Transport — `src/services/mailbox-router.service.test.ts`

- Stub algod client (suggested params, raw send capture, confirmation,
  box-by-name) with a locally generated account — fully offline.
- **send:** submitted group decodes to `[pay, appl]`; payment amount equals
  planned MBR to the app address; app args are `[put selector, mailboxId,
  envelope]`; box ref present; shared group id.
- **sendFanout:** 3 heterogeneous legs land in one group of 6 transactions
  with correct per-leg MBR; 9 legs rejected before any network call.
- **burn / reclaim:** correct selectors, args, and box refs.
- **read:** parses a synthetic 40-byte-header box into depositor, write
  round, envelope; box-404 maps to `{ exists: false }`.
- **Opt-in:** `AlgorandService` without `mailboxAppId` exposes
  `service.mailbox === undefined`; with it, an instance is exposed.

## Regression

Full Bun suite (454 pre-existing tests + new tests) and `tsc` type-check
must pass in the fledge verify lane.

## Requirement evidence map

- `REQ-algochat-021`: derivation known-answer, determinism, rotation, and
  rejection cases in `src/blockchain/mailbox.test.ts`.
- `REQ-algochat-022`: MBR table, exact-funding, and fan-out limit cases in
  `src/blockchain/mailbox.test.ts`, plus decoded group amounts in
  `src/services/mailbox-router.service.test.ts`.
- `REQ-algochat-023`: stub-algod send, fan-out, burn, reclaim, read, and
  opt-in cases in `src/services/mailbox-router.service.test.ts`.
