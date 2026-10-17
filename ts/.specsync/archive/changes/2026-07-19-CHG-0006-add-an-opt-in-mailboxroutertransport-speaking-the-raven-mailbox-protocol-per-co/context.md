---
change: CHG-0006-add-an-opt-in-mailboxroutertransport-speaking-the-raven-mailbox-protocol-per-co
artifact: context
---

# Context

## Why this change exists

The raven router mailbox contract (RFC 0001 Phase 2) is merged: the reference
implementation landed in CorvidLabs/raven#277 and its fan-out semantics are
tested and documented in raven#278. The contract is an immutable dead-drop
mailbox: a sender writes an encrypted envelope into a box keyed by
`SHA-256("raven/mailbox/v1/id" ‖ msg_key)`, and the recipient reads the box
off-chain via algod — the recipient never appears in any transaction.

Today ts-algochat delivers messages as payment transactions carrying the
envelope in the note field. That makes the sender→recipient edge visible in
the public transaction graph. The mailbox transport is the delivery mode that
removes that edge, and it cannot ship inside the contract repo: envelope
formats and key management are client concerns. The contract is deliberately
free of fan-out and multi-recipient logic (minimal immutable surface), so the
SDK must provide: per-counter key derivation, MBR-exact put planning, atomic
fan-out group construction, burn/reclaim calls, and off-chain box reads.

## Why opt-in (feature flag)

The contract is pre-audit and not deployed to MainNet. The transport is
therefore strictly opt-in: `AlgorandService` only exposes it when constructed
with a `mailboxAppId`, and the `MailboxRouterTransport` class can only be used
by explicitly instantiating it with an app id. Applications that do not
configure a mailbox app see no behavioral change — the default delivery path
(note-carrying payments) is untouched.

## Constraints inherited from the repository

- Verification must not require credentials, live wallets, or public-network
  mutation (canonical constraint) — all transport tests run against a stub
  algod client and locally generated accounts.
- Only paths listed in the change's affected paths may change; the errors
  module and barrel files stay untouched, so the transport defines its own
  typed errors and `src/index.ts` exports from deep paths (existing style).
- Envelope bytes are opaque to this transport: multi-recipient envelope
  formats remain a separate protocol-layer decision.
