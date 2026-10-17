---
change: CHG-0006-add-an-opt-in-mailboxroutertransport-speaking-the-raven-mailbox-protocol-per-co
artifact: research
---

# Research

## Contract facts (CorvidLabs/raven main, `contracts/router/src/router.algo.ts`)

ABI methods (ARC-4 signatures used for selector derivation):

- `mailboxPut(pay,byte[32],byte[])void` — group shape `[payment, app-call]`;
  payment goes sender→app address funding exactly the box MBR; contract
  asserts payment.sender == app-call sender, no overwrite, envelope
  1..2048 bytes.
- `mailboxBurn(byte[32],byte[32])void` — idempotent; absent mailbox is a
  no-op; valid proof deletes the box and refunds depositor MBR − 1000 µALGO.
- `mailboxReclaim(byte[32])void` — depositor-only, after
  write round + 2,600,000 rounds; same refund.
- `mailboxStatus(byte[32])(bool,byte[],uint64)` — readonly helper; clients
  normally read boxes off-chain for free.

MBR: `2500 + 400 × (32 + 40 + envelope_len)` µALGO. Published table
(raven README, implementation-verified): 560 B → 0.2553 ALGO,
878 B → 0.3825 ALGO, 2048 B → 0.8505 ALGO.

Key derivation (normative, raven README):

```
msg_key    = HMAC-SHA256(key = view_secret, "raven/mailbox/v1" ‖ counter_be32)
mailbox_id = SHA-256("raven/mailbox/v1/id" ‖ msg_key)
```

The contract never sees `view_secret`; a burn reveals one counter's `msg_key`
only. Rotation cadence: per-message (raven RFC §9 Q1).

## Algorand constraints

- Atomic groups are limited to 16 transactions; one put leg costs 2
  transactions (pay + appl), so fan-out is capped at 8 legs per group.
- Box references: app call must declare `{ appIndex: 0, name: mailboxId }`
  for the called app's boxes.
- Inner-txn fees are paid by the contract out of released MBR (REFUND_FEE =
  1000); the outer call needs only the minimum fee.
- App address for an app id is deterministic (`algosdk.getApplicationAddress`).

## Available primitives in this package

- `@noble/hashes` 1.8.0: `hmac` (./hmac), `sha256` (./sha256), `sha512_256`
  (./sha512) — no new dependencies required.
- `algosdk` ^3.0.0: transaction builders, `assignGroupID`, `signTransaction`,
  `ABIMethod` (selector cross-check), `getApplicationAddress`,
  `getApplicationBoxByName` for off-chain reads.
- `AlgorandService` already constructs and holds a private `algosdk.Algodv2`;
  passing it to the transport keeps one client per service.

## Precedents inside the repo

- `message-transaction.ts` defines module-local typed errors
  (`MessageTooLargeError`) rather than touching `src/errors/` — the transport
  follows this so `src/errors/` stays out of affected paths.
- Tests use `bun:test` with deterministic mocks; `algorand.service.test.ts`
  demonstrates offline service testing with generated accounts.
