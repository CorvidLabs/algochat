---
change: CHG-0006-add-an-opt-in-mailboxroutertransport-speaking-the-raven-mailbox-protocol-per-co
artifact: design
---

# Design

## Two layers, matching the package's existing separation

**Pure protocol layer — `src/blockchain/mailbox.ts`** (no I/O, no algosdk):

- Constants: both domain separators, `MAILBOX_MAX_ENVELOPE_SIZE` (2048),
  `MAILBOX_TTL_ROUNDS` (2,600,000), MBR constants (2500 / 400 / header 40),
  `MAILBOX_REFUND_FEE` (1000), `MAILBOX_MAX_GROUP_SIZE` (16),
  `MAILBOX_MAX_FANOUT_LEGS` (8), `VIEW_SECRET_SIZE` / `MSG_KEY_SIZE` /
  `MAILBOX_ID_SIZE` (32).
- `deriveMsgKey(viewSecret, counter)` — HMAC-SHA256 over
  `"raven/mailbox/v1" ‖ counter_be32`; validates 32-byte secret and
  uint32 counter.
- `deriveMailboxId(msgKey)` — SHA-256 over `"raven/mailbox/v1/id" ‖ msg_key`.
- `mailboxMbr(envelopeLength)` — exact µALGO per the contract formula.
- `planMailboxPut(viewSecret, counter, envelope)` / `planMailboxFanout(legs)`
  — pure validation + planning returning `{ mailboxId, mbr, envelope }` per
  leg; rejects empty/oversized envelopes and > 8 legs.
- `MAILBOX_METHODS` (canonical ARC-4 signature strings) and
  `mailboxMethodSelector(signature)` (SHA-512/256, first 4 bytes).
- Typed errors local to the module: `MailboxError` base with
  `InvalidViewSecretError`, `InvalidCounterError`, `InvalidMsgKeyError`,
  `MailboxEnvelopeError`, `MailboxFanoutLimitError`.

**Transport layer — `src/services/mailbox-router.service.ts`** (algosdk):

- `MailboxRouterTransport` constructed with `{ algodClient, appId }`.
  App address derived once via `getApplicationAddress`.
- `send(account, viewSecret, counter, envelope)` — one `[pay, appl]` group;
  returns `{ txid, confirmedRound, mailboxId, mbr }`.
- `sendFanout(account, legs)` — one atomic group of N legs; AVM guarantees
  all-or-nothing; returns per-leg `{ mailboxId, mbr }`.
- `burn(account, mailboxId, msgKey)` — any key holder; idempotent on-chain.
- `reclaim(account, mailboxId)` — depositor recourse after TTL.
- `read(mailboxId)` — off-chain `getApplicationBoxByName`; parses the 40-byte
  header into `{ exists, depositor, writeRound, envelope }`.
- ABI args are built with `algosdk.ABIMethod` from the canonical signature
  strings exported by the pure layer, so the selector bytes can never drift
  between layers. Every app call declares its box reference.

## Feature flag (opt-in)

`AlgorandConfig` gains optional `mailboxAppId?: number | bigint`. When present,
the service constructs the transport with its existing private algod client
and exposes it as `service.mailbox`; when absent, `service.mailbox` is
`undefined`. No other service behavior changes; the default note-carrying
delivery path is byte-identical.

## Security decisions

- `view_secret` is passed per call and never stored on the transport or the
  service; counter ownership stays with the caller (PSK ratchet integration
  is a later change).
- The transport performs zero network I/O at construction; all I/O is inside
  methods, keeping tests and tree-shaking trivial.
- Fan-out atomicity is delegated to AVM group semantics — the transport never
  submits legs individually.

## Non-goals

Multi-recipient envelope formats, counter-state persistence, indexer-based
mailbox discovery, MainNet deployment (raven RFC Phase 3 gate).
