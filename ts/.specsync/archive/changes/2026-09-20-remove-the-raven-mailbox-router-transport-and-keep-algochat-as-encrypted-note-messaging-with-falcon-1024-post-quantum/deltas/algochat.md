## REMOVED

### REQUIREMENT REQ-algochat-021

### REQUIREMENT REQ-algochat-022

### REQUIREMENT REQ-algochat-023

## ADDED

### REQUIREMENT REQ-algochat-025

The package SHALL deliver encrypted envelopes only as Algorand payment notes and SHALL NOT expose a raven mailbox router transport.

Acceptance Criteria
- Public exports omit `MailboxRouterTransport`, mailbox derivation helpers, mailbox errors, and mailbox constants.
- `AlgorandService` has no `mailboxAppId` configuration and no `mailbox` property.
- `src/blockchain/mailbox.ts` and `src/services/mailbox-router.service.ts` are absent.
- Send tests submit encrypted payment notes signed through `ChatAccount.txnSigner`.
