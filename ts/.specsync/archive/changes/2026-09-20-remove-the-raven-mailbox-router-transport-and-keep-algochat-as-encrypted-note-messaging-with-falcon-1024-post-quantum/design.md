---
change: remove-the-raven-mailbox-router-transport-and-keep-algochat-as-encrypted-note-messaging-with-falcon-1024-post-quantum
artifact: design
---

# Design

AlgoChat has one delivery path: encrypt an envelope, embed it in a payment
note, sign with `ChatAccount.txnSigner`, submit. Falcon and Ed25519 share
that path. Raven mailbox boxes, view secrets, counters, MBR legs, burn,
and reclaim are out of this package.

## Removals

- Pure protocol: `src/blockchain/mailbox.ts` (+ tests)
- Chain transport: `src/services/mailbox-router.service.ts` (+ tests)
- `AlgorandConfig.mailboxAppId` and `AlgorandService.mailbox`
- Public mailbox exports

## Falcon send path (kept, now tested)

`suggestedParamsFor` sets `flatFee` and `fee = max(fee, minFee * 3)` for
Falcon-1024. `submitSigned` uses `txnSigner`, never `account.sk`. Offline
tests decode the submitted blob and assert `pqsig.sch === "f1"` for Falcon
and a 64-byte `sig` for Ed25519.

If algod omits `minFee`, Falcon fee falls back to `params.fee` so the
payment is still constructible.

## Non-goals

Replacing X25519 with a post-quantum KEM. Hiding payment metadata.
Re-homing raven mailbox in another package.
