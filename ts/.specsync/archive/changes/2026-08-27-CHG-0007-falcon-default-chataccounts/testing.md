---
change: CHG-0007-falcon-default-chataccounts
artifact: testing
---

# Testing

```
fledge lanes run verify
```

New mnemonic tests cover Falcon default, explicit Falcon recover, import
without scheme staying Ed25519, and shared X25519 keys across schemes.
No live network mutation. Mailbox tests still use `algosdk.generateAccount()`.

## Requirement evidence

| ID | Evidence |
| --- | --- |
| REQ-algochat-024 | `src/services/mnemonic.service.test.ts` (Falcon default, Falcon recover, Ed25519 import, shared X25519 keys) and `src/services/algorand.service.test.ts` (txnSigner / Falcon ChatAccount) |
