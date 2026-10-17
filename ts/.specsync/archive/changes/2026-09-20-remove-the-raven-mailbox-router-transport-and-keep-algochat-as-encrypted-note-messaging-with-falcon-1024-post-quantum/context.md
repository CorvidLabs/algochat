---
change: remove-the-raven-mailbox-router-transport-and-keep-algochat-as-encrypted-note-messaging-with-falcon-1024-post-quantum
artifact: context
---

# Context

CHG-0006 added an opt-in `MailboxRouterTransport` speaking the raven router
mailbox protocol (RFC 0001): HMAC mailbox ids, MBR-exact box puts, atomic
fan-out, burn/reclaim, and off-chain box reads. It was never the product
delivery path. AlgoChat messages already travel as encrypted payment notes
(X25519 + ChaCha20-Poly1305, optional PSK hybrid).

The mailbox transport signs with `algosdk.Account.sk`. Falcon-1024
ChatAccounts do not expose a 64-byte secret key; they sign through
`txnSigner` with `pqsig`. The mailbox layer is therefore both unwanted
product surface and incompatible with post-quantum accounts.

Keep: encrypted note delivery, PSK v1.1, Falcon-1024 default for new
accounts, Ed25519 mnemonic import, 3× Falcon min fee, `txnSigner` send
path. Remove: every raven mailbox module, export, config flag, and
requirement.
