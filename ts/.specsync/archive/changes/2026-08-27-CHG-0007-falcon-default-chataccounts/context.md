---
change: CHG-0007-falcon-default-chataccounts
artifact: context
---

# Context

AlgoChat protocol 1.2 allows Falcon-1024 `pqsig` as the payment authorizer
while keeping X25519 envelopes unchanged. This package still created Ed25519
accounts via `algosdk.generateAccount()` and signed with `txn.signTxn(sk)`.

js-algorand-sdk 3.7.0 added `pq25WordMnemonicToSeed`,
`addressWithSignersFromRawFalcon1024Signer`, and `TransactionSigner`.
`falcon-1024` is the deterministic WASM used by go-algorand.

Raven and the site demo consume this package. Breaking `ChatAccount.account.sk`
is a 0.5.0 bump; callers must use `txnSigner`. Import without a scheme stays
Ed25519 so existing mnemonics do not change address.

MailboxRouterTransport still takes `algosdk.Account` and is unchanged.
