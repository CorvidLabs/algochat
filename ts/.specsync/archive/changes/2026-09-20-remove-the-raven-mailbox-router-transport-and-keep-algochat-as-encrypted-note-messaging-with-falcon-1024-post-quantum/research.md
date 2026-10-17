---
change: remove-the-raven-mailbox-router-transport-and-keep-algochat-as-encrypted-note-messaging-with-falcon-1024-post-quantum
artifact: research
---

# Research

## What the mailbox was

`MailboxRouterTransport` spoke CorvidLabs/raven `contracts/router`
(RFC 0001): sender writes an encrypted envelope into an application box
keyed by a derived mailbox id; recipient reads the box off-chain so the
recipient address never appears on the put transaction. That is a
dead-drop transport, not AlgoChat encryption.

Delivery AlgoChat already has: a minimum payment whose note is a v1.0 or
v1.1 PSK envelope (X25519 ECDH + ChaCha20-Poly1305). Identity for new
accounts is Falcon-1024 `pqsig` via `ChatAccount.txnSigner`.

## Why it cannot stay for Falcon

`MailboxRouterTransport.signAndSubmit` calls `txn.signTxn(account.sk)`.
Falcon ChatAccounts omit `account` and have no 64-byte Ed25519 secret.
Keeping the transport would require a second Falcon-aware signing path
for a product the library is not shipping.

## What "post-quantum ready" means here

- Account authorization: Falcon-1024 `pqsig` (algosdk 3.7 + `falcon-1024`).
- Message confidentiality vs quantum computers: still X25519 unless PSK
  hybrid is used. Envelope bytes are unchanged (protocol v1.2 account
  agility). This change does not replace X25519 with ML-KEM.

## Call sites

Mailbox symbols are exported only from `src/index.ts`. No README, HTML,
or AGENTS.md references. `AlgorandService` is the only production wiring
(`mailboxAppId` → `service.mailbox`).
