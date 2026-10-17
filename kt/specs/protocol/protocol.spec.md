---
module: protocol
version: 1.0.2
status: active
files:
  - src/main/kotlin/com/corvidlabs/algochat/Crypto.kt
  - src/main/kotlin/com/corvidlabs/algochat/Envelope.kt
  - src/main/kotlin/com/corvidlabs/algochat/Keys.kt
  - src/main/kotlin/com/corvidlabs/algochat/MessagePayload.kt
  - src/main/kotlin/com/corvidlabs/algochat/Signature.kt
  - src/main/kotlin/com/corvidlabs/algochat/Types.kt
db_tables: []
depends_on: []
---

# Protocol

## Purpose

Define Kotlin AlgoChat v1 key derivation, authenticated encryption, binary envelope layout, structured reply payloads, signed key announcements, protocol constants, and public failures in a form interoperable with the sibling implementations.

## Public API

| Export | Description |
|---|---|
| `Protocol` | Version, protocol id, byte sizes, 4096-byte note ceiling, note payment fee, HKDF salts/info, and fixed header size for v1 envelopes. |
| `KeyPair`, `Keys` | Deterministic seed derivation, ephemeral X25519 generation, ECDH, and public-key byte conversion. |
| `ChatEnvelope` | Value object whose `encode`/`decode` implement the v1 binary envelope. |
| `isChatMessage` | Safely recognizes the v1 version/protocol prefix without fully decoding. |
| `Crypto` | Encrypts messages/replies and decrypts as either sender or recipient using X25519, HKDF-SHA256, and ChaCha20-Poly1305. |
| Internal payload codec | Encodes structured text/reply JSON, decodes structured or legacy UTF-8 payloads, and recognizes key-publish JSON. |
| `MessagePayload`, `ReplyToPayload`, `DecryptedContent` | Serializable structured payload and decoded public content types. |
| `Signature` | Ed25519 signing/verification for encryption keys and stable SHA-256 fingerprints. |
| `AlgoChatException` | Public typed failures for envelope, version, cryptography, key, blockchain, storage, and payload errors. |

### Complete export index

| Export | Contract role |
|---|---|
| `encryptMessage` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `encryptReply` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `decryptMessage` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `version` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `protocolId` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `senderPublicKey` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `ephemeralPublicKey` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `nonce` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `encryptedSenderKey` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `ciphertext` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `KeyPair` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `privateKey` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `publicKey` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `Keys` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `deriveKeysFromSeed` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `generateEphemeralKeyPair` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `x25519Ecdh` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `publicKeyToBytes` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `publicKeyFromBytes` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `text` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `replyTo` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `txid` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `preview` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `SIGNATURE_SIZE` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `signEncryptionKey` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `verifyEncryptionKey` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `verifyEncryptionKeyBytes` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `fingerprint` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `VERSION` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `PROTOCOL_ID` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `HEADER_SIZE` | Fixed v1 header size, 126 bytes. |
| `TAG_SIZE` | Poly1305 tag size, 16 bytes. |
| `ENCRYPTED_SENDER_KEY_SIZE` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `MAX_NOTE_SIZE` | Algorand note ceiling, 4096 bytes. |
| `MAX_PAYLOAD_SIZE` | Maximum plaintext, 3954 bytes (4096 minus the 126-byte header and 16-byte tag). |
| `paymentFee` | Payment fee for a note: one minFee plus the rounded note surcharge. No Falcon signer. |
| `NONCE_SIZE` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `PUBLIC_KEY_SIZE` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `KEY_DERIVATION_SALT` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `KEY_DERIVATION_INFO` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `ENCRYPTION_INFO_PREFIX` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `SENDER_KEY_INFO_PREFIX` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `MINIMUM_PAYMENT` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `DecryptedContent` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `replyToId` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `replyToPreview` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `InvalidPublicKey` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `KeyDerivationFailed` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `InvalidSignature` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `EncryptionFailed` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `DecryptionFailed` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `InvalidEnvelope` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `IndexerNotConfigured` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `PublicKeyNotFound` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `UnverifiedKey` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `InvalidRecipient` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `TransactionFailed` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `InsufficientBalance` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `KeyNotFound` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `StorageFailed` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |
| `MessageNotFound` | Existing protocol symbol; its behavior and invariants are defined by the owning API group below. |

The complete member-level contract also includes these callable operations, fields, constants, result types, and concrete failure cases:

`encryptMessage`, `encryptReply`, `decryptMessage`, `version`, `protocolId`, `senderPublicKey`, `ephemeralPublicKey`, `nonce`, `encryptedSenderKey`, `ciphertext`, `KeyPair`, `privateKey`, `publicKey`, `Keys`, `deriveKeysFromSeed`, `generateEphemeralKeyPair`, `x25519Ecdh`, `publicKeyToBytes`, `publicKeyFromBytes`, `text`, `replyTo`, `txid`, `preview`, `SIGNATURE_SIZE`, `signEncryptionKey`, `verifyEncryptionKey`, `verifyEncryptionKeyBytes`, `fingerprint`, `VERSION`, `PROTOCOL_ID`, `HEADER_SIZE`, `TAG_SIZE`, `ENCRYPTED_SENDER_KEY_SIZE`, `MAX_NOTE_SIZE`, `MAX_PAYLOAD_SIZE`, `paymentFee`, `NONCE_SIZE`, `PUBLIC_KEY_SIZE`, `KEY_DERIVATION_SALT`, `KEY_DERIVATION_INFO`, `ENCRYPTION_INFO_PREFIX`, `SENDER_KEY_INFO_PREFIX`, `MINIMUM_PAYMENT`, `DecryptedContent`, `replyToId`, `replyToPreview`, `InvalidPublicKey`, `KeyDerivationFailed`, `InvalidSignature`, `EncryptionFailed`, `DecryptionFailed`, `InvalidEnvelope`, `IndexerNotConfigured`, `PublicKeyNotFound`, `UnverifiedKey`, `InvalidRecipient`, `TransactionFailed`, `InsufficientBalance`, `KeyNotFound`, `StorageFailed`, and `MessageNotFound`.

## Invariants

1. A v1 envelope is version byte, protocol byte, 32-byte sender key, 32-byte ephemeral key, 12-byte nonce, 48-byte encrypted sender key, then authenticated ciphertext.
2. Encryption uses a fresh ephemeral X25519 pair and nonce; HKDF context binds the expected sender and recipient keys.
3. Both sender and recipient can decrypt the same envelope, but unrelated private keys cannot authenticate it.
4. Reply metadata is optional; decoding valid legacy UTF-8 plaintext remains backward compatible.
5. Key announcements sign exactly the encryption public-key bytes with Ed25519 and fingerprints are lowercase hexadecimal SHA-256.
6. A standard note is at most 4096 bytes. The header stays 126 bytes and the tag stays 16 bytes, so plaintext is at most 3954 bytes. A plaintext of 882 bytes still fits in 1024 bytes. One byte past 3954 is rejected before a transaction is built.
7. The payment fee is one minimum fee plus the note surcharge. Bytes through 1024 add nothing. Each later byte adds one ten-thousandth of the minimum fee, rounded up once. This library has no Falcon signer, so the scheme contribution stays one minimum fee. Protocol document revision for this ceiling is 1.2.1.

## Behavioral Examples

```text
Given Alice's private/public key and Bob's public key
When Crypto.encryptMessage creates an envelope for Bob
Then Alice and Bob can decrypt the same text and an unrelated key fails authentication

Given a structured reply payload with a transaction id and preview
When MessagePayloadCodec decodes its UTF-8 JSON bytes
Then DecryptedContent contains the text and both reply fields

Given minFee 1000
When Protocol.paymentFee is applied to notes of 1024, 2000, and 4096 bytes
Then the fees are 1000, 1098, and 1308

Given a 3954-byte plaintext
When Crypto.encryptMessage encodes it
Then the note is exactly 4096 bytes

Given a 3955-byte plaintext
When Crypto.encryptMessage is called
Then EncryptionFailed is thrown and no envelope is returned
```

## Error Cases

| Error | When | Behavior |
|---|---|---|
| `InvalidEnvelope` | Input is shorter than the fixed header or has malformed fields. | Decoding stops without reading beyond the supplied bytes. |
| `UnsupportedVersion` | The version or protocol byte is not AlgoChat v1. | Reject instead of attempting incompatible decryption. |
| `DecryptionFailed` | AEAD authentication fails or the envelope is not for the supplied identity. | Return no unauthenticated plaintext. |
| `InvalidKey` | Public-key or address bytes have an invalid representation. | Reject before ECDH or signature verification. |
| `InvalidPayload` | Structured payload bytes are neither supported JSON nor valid legacy content. | Surface a typed payload failure. |
| `EncryptionFailed` | Plaintext exceeds 3954 bytes. | Reject before an envelope or transaction is built. |

## Dependencies

- Bouncy Castle X25519, Ed25519, HKDF-SHA256, and ChaCha20-Poly1305 primitives.
- Kotlin serialization JSON for structured message payloads.
- Java secure randomness and message digests.

## Change Log

| Version | Date | Changes |
|---|---|---|
| 1.0.0 | 2026-07-14 | Canonically document the existing Kotlin AlgoChat v1 wire and cryptographic behavior. |
| 1.0.2 | 2026-10-16 | Raise the note ceiling to 4096 bytes (protocol document revision 1.2.1). Plaintext max is 3954. Header stays 126 and the tag stays 16. Payment fee adds the note surcharge on one minFee. |
| 2026-07-14 | CHG-0002-run-the-existing-jdk-17-and-21-ci-matrix-when-trust-and-specsync-governance-file: Complete Kotlin AlgoChat SDD adoption and run the native CI matrix |

## SDD Adoption

The base protocol contract was established from the existing production sources and envelope, payload, signature, cryptography, and cross-implementation tests. Adoption changes governance only; it does not change wire bytes or cryptographic behavior.

