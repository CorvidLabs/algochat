## ADDED

### REQUIREMENT REQ-algochat-024

New ChatAccounts SHALL default to Falcon-1024 authorization. Importing a mnemonic without a scheme SHALL recover the Ed25519 account. Encryption keys SHALL be derived from 32-byte mnemonic entropy for both schemes.

Acceptance Criteria
- `createRandomChatAccount()` returns `scheme: 'falcon-1024'` and a working `txnSigner`.
- `createChatAccountFromMnemonic(mn)` returns `scheme: 'ed25519'` and the classical address.
- `createChatAccountFromMnemonic(mn, { scheme: 'falcon-1024' })` recovers the Falcon address from a Falcon-generated mnemonic.
- The same mnemonic yields identical X25519 keys and different addresses across schemes.
- Falcon payments use at least `minFee * 3`.
