---
id: remove-the-raven-mailbox-router-transport-and-keep-algochat-as-encrypted-note-messaging-with-falcon-1024-post-quantum
state: archived
type: refactor
base_commit: e532c343ccc8311277e42f2d4c1aac11fbe5c4a8
---

# Remove the Raven mailbox router transport and keep AlgoChat as encrypted note messaging with Falcon-1024 post-quantum account support

## Intent

Remove the Raven mailbox router transport and keep AlgoChat as encrypted note messaging with Falcon-1024 post-quantum account support

## Affected Canonical Specs

- `algochat`

## Acceptance Criteria

- Public package no longer exports MailboxRouterTransport, mailbox derivation helpers, mailbox errors, or mailbox constants. AlgorandService has no mailboxAppId or mailbox property. Raven mailbox source and tests are deleted. Delivery is encrypted payment notes only. Falcon-1024 remains the default for createRandomChatAccount; mnemonic import without a scheme stays Ed25519; Falcon accounts sign through txnSigner with pqsig and at least 3x minFee and do not expose account.sk. Standard X25519+ChaCha20-Poly1305 and PSK envelopes still round-trip. bun test and fledge lanes run verify pass.

## No-spec Rationale

Not applicable
