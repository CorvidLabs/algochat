---
spec: protocol.spec.md
---

## Automated Testing

| Test File | Type | What It Covers |
|-----------|------|----------------|
| src/crypto.rs tests | Rust unit | v1/v2 encrypt/decrypt, payload forms, limits, and wrong keys. |
| src/envelope.rs tests | Rust unit | Encoding, decoding, recognition, versions, and malformed input. |
| src/keys.rs tests | Rust unit | Deterministic derivation, length checks, and ECDH agreement. |
| src/signature.rs tests | Rust unit | Signing, verification, malformed input, and fingerprinting. |
| tests/cross_impl.rs | Rust integration | Known answers, tamper, identity, Unicode, and external compatibility. |

## Manual Testing

No manual cryptographic acceptance substitutes for deterministic native and cross-vector suites.

## Edge Cases & Boundary Conditions

| Scenario | Expected Behavior |
|----------|-------------------|
| 882-byte plaintext | Encrypt, and the note is at most 1024 bytes. |
| 3954-byte plaintext | Encode to exactly 4096 bytes. |
| 3955-byte plaintext | Reject with MessageTooLarge before a transaction is built. |
| Notes of 1024, 2000, and 4096 bytes at min fee 1000 | Fees are 1000, 1098, and 1308. |
| Unknown version or protocol | Reject with typed protocol error. |
| Standard frame of 141 bytes | Reject as too short. |
| Standard frame of 142 bytes | Framing is complete. |
| Authenticated standard note of 4097 bytes | Reject before returning plaintext. |
| Mutated v2 header | Fail AEAD authentication. |
| Wrong recipient key | Fail without plaintext. |
| Invalid signature length | Return typed signature error. |

## Shipped PQ evidence

`src/pq.rs::tests::parity_fixture` uses the committed `vectors/pq-mlkem768.json` to check ML-KEM/key-combiner parity, handshake recovery, sender reopening, data round trips, and tamper rejection. `live_localnet_note` is conditional and must not be counted as a live transaction check without its environment/input. The documentation audit does not claim a fresh native run.
