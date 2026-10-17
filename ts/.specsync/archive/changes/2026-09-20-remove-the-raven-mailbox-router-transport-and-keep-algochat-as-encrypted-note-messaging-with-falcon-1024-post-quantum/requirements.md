---
change: remove-the-raven-mailbox-router-transport-and-keep-algochat-as-encrypted-note-messaging-with-falcon-1024-post-quantum
artifact: requirements
---

# Requirements

Removes REQ-algochat-021, REQ-algochat-022, and REQ-algochat-023 (raven
mailbox derivation, MBR planning, and opt-in transport).

Adds REQ-algochat-025: the package SHALL deliver encrypted envelopes only
as Algorand payment notes and SHALL NOT expose a raven mailbox router
transport.

REQ-algochat-024 is unchanged: new ChatAccounts default to Falcon-1024
`pqsig`, mnemonic import without a scheme stays Ed25519, encryption keys
come from mnemonic entropy, Falcon payments use at least `minFee * 3`.
