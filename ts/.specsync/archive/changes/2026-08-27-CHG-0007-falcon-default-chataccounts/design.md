---
change: CHG-0007-falcon-default-chataccounts
artifact: design
---

# Design

`ChatAccount` gains `scheme` and `txnSigner`. `account` (64-byte Ed25519 sk)
is optional and only set for `ed25519`. Falcon accounts hold the Falcon
key material only inside the signer closure.

`createRandomChatAccount()` → Falcon-1024.
`createChatAccountFromMnemonic(mn)` → Ed25519.
`createChatAccountFromMnemonic(mn, { scheme: 'falcon-1024' })` → Falcon.

`AlgorandService` signs through `txnSigner` and, for Falcon, sets
`flatFee` to `max(fee, minFee * 3)`.
