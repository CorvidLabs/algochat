---
spec: algochat.spec.md
---

## Historical module verification lane

The fixed counts below were recorded for the governance migration. They describe its accepted lane rather than a current run. The active root release qualification runs full `swift test`, `swift build`, exported-source PQ tests and a separate SwiftPM consumer.

## Automated Testing

| Verification | Type | Contract Evidence |
|--------------|------|-------------------|
| `swift build -v` | Package build | REQ-algochat-001, REQ-algochat-012 |
| `swift test --filter Crypto` through the Fledge crypto task | Deterministic unit tests (70 tests, 13 suites) | REQ-algochat-002, REQ-algochat-003, REQ-algochat-006, REQ-algochat-007, REQ-algochat-008, REQ-algochat-011 |
| Remaining unit and envelope-security batch through the Fledge unit task | Deterministic tests (172 tests, 22 suites) | REQ-algochat-002, REQ-algochat-003, REQ-algochat-004, REQ-algochat-005, REQ-algochat-007, REQ-algochat-009, REQ-algochat-010, REQ-algochat-011 |
| `swift build --product algochat` | Executable product build | REQ-algochat-001, REQ-algochat-012 |
| `specsync check --strict --require-coverage 100 --force` | Contract coverage | REQ-algochat-012 |
| `fledge trust doctor` and `fledge trust verify` | Unified governance gate | REQ-algochat-012 |

## Environment-Dependent Testing

LocalNet integration exercises real Algorand submission, confirmation, and indexer behavior for REQ-algochat-005 when an AlgoKit LocalNet is available. It is intentionally separate from the deterministic migration gate; no hosted or local LocalNet success is asserted by this specification change.

## Edge Cases and Boundaries

| Scenario | Expected Behavior |
|----------|-------------------|
| Standard or PSK envelope is truncated, oversized, or has a wrong protocol byte | Decode fails before plaintext is exposed |
| Signature, authentication tag, public key, or PSK is wrong | Authentication/decryption fails without recording receive success |
| PSK counter repeats or exceeds the acceptance window | Replay/out-of-range error; persisted state remains valid |
| The same PSK transaction is fetched again, or its note is copied under a new id | The original transaction still returns its plaintext. The copy returns no message. A failed tag records nothing |
| Send counter is `4294967295` | That value is returned once. The stored counter stays there, and a decoded copy still refuses another send |
| Reply preview exceeds 80 characters | It is deterministically truncated while retaining the original transaction identifier |
| Indexer lags after submission | Indexed send waits up to its timeout; fire-and-forget and confirmed modes retain their distinct semantics |
| Queue restarts after a transient failure | Durable pending and retry state reloads and can resume |
| Apple security frameworks are unavailable | Cross-platform implementation reports unsupported capability and file-backed alternatives remain usable |

## Observed gaps against the expected cases

- The expected oversize-decode rejection above is not implemented by the standard or PSK decoder; they enforce the minimum header/tag size only.
- The expected unsupported-Keychain error above is not implemented on tvOS/watchOS/Linux; the type uses process memory. File-backed PSK and queue data also remains plaintext.
- Existing `swift/Tests/AlgoChatTests/PQTests.swift`, root `vectors/` and the `pqcross` adapter exercise hybrid helpers separately from high-level network behavior.

These are implementation-status notes, not changes to accepted expectations. See the [accuracy ledger](../../../docs/ACCURACY.md).
