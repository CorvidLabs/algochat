---
spec: algochat.spec.md
---

## Test Plan

### Native verification

- `bun run tsc` validates every public declaration and implementation under strict TypeScript settings.
- `bun test` runs the deterministic crypto, signature, discovery, indexer, service, mnemonic, conversation, PSK, cache, and queue suite, including Falcon vs Ed25519 scheme recovery and Falcon `pqsig` / Ed25519 `sig` send-path tests against a stubbed algod client.
- Note-capacity tests cover plaintext 882 and 878, plaintext 3954 and 3950 encoding to 4096 bytes, one byte over failing before send, and fee vectors 1024 to 1000, 1025 to 1001, 2000 to 1098, 4096 to 1308, and Falcon 4096 to 3308 at minFee 1000.

### Security and compatibility

- Corrupt, truncated, forged, wrong-key, replayed, and oversize inputs must fail closed.
- Network-facing tests use injected fixtures and never require credentials or mutate Algorand networks.
- Cross-implementation protocol vectors remain an independent compatibility boundary where supplied by the protocol repository.

### Separate compatibility evidence

- `bun conformance/tools/verify.mjs` (from `ts/`) verifies the frozen standard/PSK corpus with 85 checks; it is not called by the active root qualification script.
- `src/pq/pq.test.ts` and root `vectors/` cover hybrid KDF, handshake, sender recovery, announcements, session data and tampering. Coverage by those cases does not establish replay handling or high-level hybrid integration.
- The active root release qualification packs the package and checks imports/declarations in a separate Node.js consumer. See the [accuracy ledger](../../../docs/ACCURACY.md) for accepted-contract gaps that tests or structural coverage do not resolve.
