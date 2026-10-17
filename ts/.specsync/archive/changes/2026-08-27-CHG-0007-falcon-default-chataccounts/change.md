---
id: CHG-0007-falcon-default-chataccounts
state: archived
type: feature
base_commit: 6a875deb73f137c99705e1eb353406398ad20e83
---

# Default new ChatAccounts to Falcon-1024 pqsig while mnemonic import stays Ed25519

## Intent

Default new ChatAccounts to Falcon-1024 pqsig while mnemonic import stays Ed25519

## Affected Canonical Specs

- `algochat`

## Acceptance Criteria

- createRandomChatAccount() returns a Falcon-1024 ChatAccount with a 58-char address, txnSigner, and 25-word mnemonic; createChatAccountFromMnemonic(mn) stays Ed25519; createChatAccountFromMnemonic(mn, {scheme:'falcon-1024'}) recovers the Falcon address; same mnemonic yields identical X25519 keys across schemes and different addresses; AlgorandService send/reply/publishKey sign via txnSigner and apply 3x minFee for Falcon; existing tests plus new scheme tests pass; fledge lanes run verify is green.

## No-spec Rationale

Not applicable
