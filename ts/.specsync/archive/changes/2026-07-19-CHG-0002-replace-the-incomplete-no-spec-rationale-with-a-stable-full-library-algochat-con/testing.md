---
change: CHG-0002-replace-the-incomplete-no-spec-rationale-with-a-stable-full-library-algochat-con
artifact: testing
---

# Testing

Run `bun run tsc` and `bun test` through the existing Fledge verification
lane. Run strict SpecSync with forced measurement and a 100% threshold. Confirm
all four agent integrations and Trust doctor. After acceptance, use released
SpecSync 5.0.1 and immutable Trust 1.0.0 as the authoritative consumer checks.
Inspect the final diff to prove no `src/`, package, lockfile, or test bytes
changed.

## Requirement evidence map

- `REQ-algochat-001` and `REQ-algochat-002`: encryption and envelope suites.
- `REQ-algochat-003`: signature suite.
- `REQ-algochat-004`: discovery and blockchain indexer suites.
- `REQ-algochat-005`: Algorand service note-limit cases plus transaction source review.
- `REQ-algochat-006`, `REQ-algochat-007`, `REQ-algochat-008`, and
  `REQ-algochat-009`: PSK encryption, vector, state, envelope, and URI cases.
- `REQ-algochat-010`: deterministic Algorand service suite.
- `REQ-algochat-011`: mnemonic, account, address, and base64 suite.
- `REQ-algochat-012`: discovery and message-indexer pagination suites.
- `REQ-algochat-013`: conversation suite.
- `REQ-algochat-014`: pending-message source contract and queue transition cases.
- `REQ-algochat-015`: complete SendQueue suite.
- `REQ-algochat-016`: strict TypeScript build of SyncManager plus queue integration.
- `REQ-algochat-017`: PublicKeyCache and queue-storage cache cases.
- `REQ-algochat-018`: strict build plus file and in-memory key-storage error contract review.
- `REQ-algochat-019`: strict build plus ChatError code, narrowing, and wrapping review.
- `REQ-algochat-020`: canonical specification and README security-table review.
