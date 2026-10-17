---
module: cross-vectors
version: 1.0.1
status: active
files:
  - src/test/kotlin/com/corvidlabs/algochat/CrossImplTest.kt
db_tables: []
depends_on:
  - protocol
  - psk
---

# Cross Vectors

## Purpose

Define the executable interoperability boundary that decrypts envelopes emitted by Swift, TypeScript, Python, Rust, and Kotlin implementations and can export deterministic Kotlin envelopes for reciprocal consumers.

## Public API

This module is test-only and exports no library API. Its contract is the `CrossImplTest` fixture schema and the assertions applied to sibling implementation artifacts.

Each fixture records hex sender and recipient seeds, a hex-encoded envelope,
expected UTF-8 plaintext, and an implementation label so failures identify the
compatibility boundary that regressed.

| Test export | Contract role |
|---|---|
| `CrossImplTest` | Existing cross-vectors symbol; its behavior and invariants are defined by the owning API group below. |
| `ALICE_SEED_HEX` | Existing cross-vectors symbol; its behavior and invariants are defined by the owning API group below. |
| `BOB_SEED_HEX` | Existing cross-vectors symbol; its behavior and invariants are defined by the owning API group below. |
| `TEST_MESSAGES` | Existing cross-vectors symbol; its behavior and invariants are defined by the owning API group below. |
| `hexToBytes` | Existing cross-vectors symbol; its behavior and invariants are defined by the owning API group below. |
| `aliceKeys` | Existing cross-vectors symbol; its behavior and invariants are defined by the owning API group below. |
| `bobKeys` | Existing cross-vectors symbol; its behavior and invariants are defined by the owning API group below. |
| `bytesToHex` | Existing cross-vectors symbol; its behavior and invariants are defined by the owning API group below. |

## Invariants

1. Every imported envelope is decoded and authenticated by production Kotlin protocol code, not by a fixture-specific shortcut.
2. Swift, TypeScript, Python, Rust, and Kotlin fixtures must resolve to their declared plaintext using the declared seed identities.
3. Kotlin export uses the same production encryption path and a stable machine-readable fixture shape.
4. Optional sibling-repository fixture discovery may add evidence but absence of an uncommitted sibling checkout does not make the committed suite nondeterministic.

## Behavioral Examples

```text
Given a Rust-produced fixture containing seeds, envelope bytes, and expected text
When CrossImplTest derives the Kotlin recipient identity and decrypts the envelope
Then authenticated plaintext equals the fixture text exactly
```

## Error Cases

| Error | When | Behavior |
|---|---|---|
| Fixture parse failure | Required hex or plaintext data is malformed. | Fail the named producer test. |
| Authentication failure | The wire bytes, derivation context, or key identity diverges. | Fail without accepting plaintext. |
| Plaintext mismatch | Decryption succeeds but content differs. | Fail with the implementation boundary identified. |

## Dependencies

- The production `protocol` implementation under test.
- Optional sibling AlgoChat worktrees for additional local fixture discovery.

## Change Log

| Version | Date | Changes |
|---|---|---|
| 1.0.0 | 2026-07-14 | Canonically document the existing five-language interoperability harness. |
| 2026-07-14 | CHG-0002-run-the-existing-jdk-17-and-21-ci-matrix-when-trust-and-specsync-governance-file: Complete Kotlin AlgoChat SDD adoption and run the native CI matrix |

## SDD Adoption

The interoperability contract was established from the existing `CrossImplTest` producer-specific decrypt and Kotlin export cases. Adoption changes governance only; it does not change fixture or production protocol behavior.

