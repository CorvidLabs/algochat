---
module: psk
version: 1.0.2
status: active
files:
  - src/main/kotlin/com/corvidlabs/algochat/PSKCrypto.kt
  - src/main/kotlin/com/corvidlabs/algochat/PSKEnvelope.kt
  - src/main/kotlin/com/corvidlabs/algochat/PSKExchange.kt
  - src/main/kotlin/com/corvidlabs/algochat/PSKRatchet.kt
  - src/main/kotlin/com/corvidlabs/algochat/PSKState.kt
  - src/main/kotlin/com/corvidlabs/algochat/PSKTypes.kt
db_tables: []
depends_on:
  - protocol
---

# PSK

## Purpose

Define the optional AlgoChat v1 pre-shared-key protocol: deterministic ratchet derivation, replay-resistant counter state, hybrid X25519-plus-PSK encryption, protocol-id-2 envelopes, and portable exchange URIs.

## Public API

| Export | Description |
|---|---|
| `PSKProtocol` | Protocol id, byte sizes, counter window, and domain-separation constants for the PSK variant. |
| `PSKEnvelope`, `PSKEnvelopeCodec`, `isPSKMessage` | Counter-bearing binary envelope value, codec, and safe prefix recognition. |
| `PSKRatchet` | Derives session, per-position, hybrid symmetric, and sender-wrapping keys from PSK and context. |
| `PSKState` | Mutex-protected send/receive counters, replay window, receive transaction, PSK lookup, and reset. |
| `PSKCrypto` | Encrypts and decrypts PSK messages for both sender and recipient while binding ratchet position and asymmetric identities. |
| `PSKExchangeURI` | Encodes and decodes `algochat-psk://v1` address, 32-byte PSK, and optional label parameters. |

### Complete export index

| Export | Contract role |
|---|---|
| `encryptMessage` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |
| `encryptReply` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |
| `decryptMessage` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |
| `PSKEnvelopeCodec` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |
| `encode` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |
| `decode` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |
| `isPSKMessage` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |
| `address` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |
| `psk` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |
| `label` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |
| `deriveSessionPSK` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |
| `derivePositionPSK` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |
| `derivePSKAtCounter` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |
| `deriveHybridSymmetricKey` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |
| `deriveSenderKey` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |
| `initialPSK` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |
| `peerId` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |
| `VERSION` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |
| `PROTOCOL_ID` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |
| `HEADER_SIZE` | Fixed PSK header size, 130 bytes. |
| `TAG_SIZE` | Poly1305 tag size, 16 bytes. |
| `ENCRYPTED_SENDER_KEY_SIZE` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |
| `MAX_PAYLOAD_SIZE` | Maximum PSK plaintext, 3950 bytes (4096 minus the 130-byte header and 16-byte tag). |
| `SESSION_SIZE` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |
| `COUNTER_WINDOW` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |
| `NONCE_SIZE` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |
| `PUBLIC_KEY_SIZE` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |
| `COUNTER_SIZE` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |
| `SESSION_SALT` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |
| `POSITION_SALT` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |
| `HYBRID_KEY_INFO_PREFIX` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |
| `SENDER_KEY_INFO_PREFIX` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |
| `PSKEnvelope` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |
| `ratchetCounter` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |
| `senderPublicKey` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |
| `ephemeralPublicKey` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |
| `nonce` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |
| `encryptedSenderKey` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |
| `ciphertext` | Existing psk symbol; its behavior and invariants are defined by the owning API group below. |

The complete member-level PSK contract also includes these operations, fields, and constants:

`encryptMessage`, `encryptReply`, `decryptMessage`, `PSKEnvelopeCodec`, `encode`, `decode`, `isPSKMessage`, `address`, `psk`, `label`, `deriveSessionPSK`, `derivePositionPSK`, `derivePSKAtCounter`, `deriveHybridSymmetricKey`, `deriveSenderKey`, `initialPSK`, `peerId`, `VERSION`, `PROTOCOL_ID`, `HEADER_SIZE`, `TAG_SIZE`, `ENCRYPTED_SENDER_KEY_SIZE`, `MAX_PAYLOAD_SIZE`, `SESSION_SIZE`, `COUNTER_WINDOW`, `NONCE_SIZE`, `PUBLIC_KEY_SIZE`, `COUNTER_SIZE`, `SESSION_SALT`, `POSITION_SALT`, `HYBRID_KEY_INFO_PREFIX`, `SENDER_KEY_INFO_PREFIX`, `PSKEnvelope`, `ratchetCounter`, `senderPublicKey`, `ephemeralPublicKey`, `nonce`, `encryptedSenderKey`, and `ciphertext`.

## Invariants

1. PSK envelope protocol id is distinct from the base protocol and includes a big-endian unsigned ratchet counter before the base key/nonce fields.
2. Ratchet derivations are deterministic for identical PSK, peer context, and counter, but domain-separated across sessions, positions, hybrid keys, and sender keys.
3. Sending consumes monotonically increasing counters and fails before unsigned wraparound.
4. Receiving rejects replays and counters outside the configured forward window; failed decryption does not consume a counter.
5. Hybrid encryption requires both the correct 32-byte PSK and the correct X25519 identity; neither factor alone yields plaintext.
6. Exchange decoding requires the v1 scheme, an address, and exactly 32 decoded PSK bytes.
7. A PSK note is at most 4096 bytes. The header stays 130 bytes and the tag stays 16 bytes, so plaintext is at most 3950 bytes. A plaintext of 878 bytes still fits in 1024 bytes. One byte past 3950 is rejected before a transaction is built.

## Behavioral Examples

```text
Given peers sharing the same PSK and using counter 7
When one peer encrypts a PSK envelope and the other receives it
Then the receiver derives the matching position key, authenticates plaintext, and records counter 7

Given a previously accepted counter
When the same envelope is received again
Then PSKState rejects it as a replay before returning plaintext

Given a 3950-byte PSK plaintext
When PSKCrypto.encryptMessage encodes it
Then the note is exactly 4096 bytes

Given a 3951-byte PSK plaintext
When PSKCrypto.encryptMessage is called
Then EncryptionFailed is thrown and no envelope is returned
```

## Error Cases

| Error | When | Behavior |
|---|---|---|
| `InvalidEnvelope` | PSK envelope length, version, protocol id, or field widths are invalid. | Reject before cryptographic processing. |
| `DecryptionFailed` | PSK, asymmetric identity, nonce, counter, or ciphertext authentication is wrong. | Return no plaintext and do not commit receive state. |
| `IllegalArgumentException` | Exchange URI scheme/parameters or PSK size is invalid. | Reject the exchange value. |
| `IllegalStateException` | Send counter would wrap or receive counter violates replay/window policy. | Preserve a valid prior state. |
| `EncryptionFailed` | Plaintext exceeds 3950 bytes. | Reject before an envelope or transaction is built. |

## Dependencies

- The `protocol` spec's X25519 key conversions and authenticated-encryption primitives.
- Bouncy Castle HKDF-SHA256 and ChaCha20-Poly1305.
- Kotlin coroutine mutexes for atomic counter transitions.

## Change Log

| Version | Date | Changes |
|---|---|---|
| 1.0.0 | 2026-07-14 | Canonically document the existing PSK envelope, ratchet, state, crypto, and exchange behavior. |
| 1.0.2 | 2026-10-16 | Raise the PSK plaintext max to 3950 so a full note is 4096 bytes. Header stays 130 and the tag stays 16. |
| 2026-07-14 | CHG-0002-run-the-existing-jdk-17-and-21-ci-matrix-when-trust-and-specsync-governance-file: Complete Kotlin AlgoChat SDD adoption and run the native CI matrix |

## SDD Adoption

The PSK contract was established from the existing production sources and the known-answer, state, envelope, hybrid-encryption, and exchange cases in `PSKTest`. Adoption changes governance only; it does not change ratchet or envelope behavior.

