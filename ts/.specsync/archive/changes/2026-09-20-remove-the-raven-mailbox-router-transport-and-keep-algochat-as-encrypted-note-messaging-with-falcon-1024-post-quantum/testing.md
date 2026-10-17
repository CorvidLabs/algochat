---
change: remove-the-raven-mailbox-router-transport-and-keep-algochat-as-encrypted-note-messaging-with-falcon-1024-post-quantum
artifact: testing
---

# Testing

```
fledge lanes run verify
specsync check --spec algochat
```

No live network mutation. Mailbox tests are deleted with the transport.

New service tests inject a stub algod client, capture `sendRawTransaction`
bytes, and decode them with `algosdk.decodeSignedTransaction`.

## Requirement evidence

| ID | Evidence |
| --- | --- |
| REQ-algochat-024 | `src/services/mnemonic.service.test.ts` (Falcon default, recover, Ed25519 import, shared X25519 keys); `src/services/algorand.service.test.ts` (Falcon `pqsig` send + 3× fee, Ed25519 `sig` send) |
| REQ-algochat-025 | Public index no longer exports mailbox symbols; `AlgorandService` has no `mailbox` / `mailboxAppId`; mailbox source files are gone; send tests submit encrypted payment notes only |
