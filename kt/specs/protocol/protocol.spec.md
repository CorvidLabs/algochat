---
module: protocol
version: 1.0.2
status: active
files:
  - src/main/kotlin/com/corvidlabs/algochat/Crypto.kt
  - src/main/kotlin/com/corvidlabs/algochat/Envelope.kt
  - src/main/kotlin/com/corvidlabs/algochat/Keys.kt
  - src/main/kotlin/com/corvidlabs/algochat/MessagePayload.kt
  - src/main/kotlin/com/corvidlabs/algochat/PQ.kt
  - src/main/kotlin/com/corvidlabs/algochat/GroupAdmin.kt
  - src/main/kotlin/com/corvidlabs/algochat/Signature.kt
  - src/main/kotlin/com/corvidlabs/algochat/Types.kt
db_tables: []
depends_on: []
---

# Protocol

## Purpose

Define Kotlin AlgoChat v1 key derivation, authenticated encryption, binary envelope layout, structured reply payloads, signed key announcements, protocol constants, and public failures in a form interoperable with the sibling implementations. Hybrid sessions add an ML-KEM-768 handshake and a steady-state message. Those notes do not change v1 or Extra lock envelopes.

## Public API

| Export | Description |
|---|---|
| `NAME_MAX` | Room administration symbol. |
| `ADMIN_MAX` | Room administration symbol. |
| `MEMBER_MAX` | Room administration symbol. |
| `DELIVER_PLAINTEXT_SIZE` | Room administration symbol. |
| `DELIVER_ACTION` | Room administration symbol. |
| `policy` | Room administration symbol. |
| `epoch` | Room administration symbol. |
| `sender` | Room administration symbol. |
| `txId` | Room administration symbol. |
| `round` | Room administration symbol. |
| `offset` | Room administration symbol. |
| `op` | Room administration symbol. |
| `reason` | Room administration symbol. |
| `state` | Room administration symbol. |
| `accepted` | Room administration symbol. |
| `rejected` | Room administration symbol. |
| `groupId` | Room administration symbol. |
| `mailbox` | Room administration symbol. |
| `groupKey` | Room administration symbol. |
| `adminTxId` | Room administration symbol. |
| `parent` | Room administration symbol. |
| `name` | Room administration symbol. |
| `owner` | Room administration symbol. |
| `admins` | Room administration symbol. |
| `members` | Room administration symbol. |
| `subject` | Room administration symbol. |
| `pending` | Room administration symbol. |
| `advance` | Room administration symbol. |
| `GroupAdmin` | Room administration reducer and action-5 delivery. |
| `draftAdmin` | Drafts an authorized 0x03 note. |
| `reduceAdmin` | Reduces administration transactions. |
| `senderMayPost` | Whether a member may post at an epoch. |
| `deliveryAuthorized` | Whether one accepted record authorizes a key delivery. |
| `sealGroupKeyDelivery` | Seals a 227-byte 0x06 action-5 delivery. |
| `openGroupKeyDelivery` | Opens a 227-byte 0x06 action-5 delivery. |
| `RoomState` | Accepted room roster. |
| `AdminEvent` | One administration transaction. |
| `AcceptedAdmin` | One accepted administration record. |
| `RejectedAdmin` | One rejected administration transaction. |
| `ReduceAdminResult` | Reducer output. |
| `OpenedGroupKeyDelivery` | Opened action-5 delivery. |
| `RoomAdminException` | Room administration error. |
| `Protocol` | Version, protocol id, byte sizes, 4096-byte note ceiling, note payment fee, HKDF salts/info, and fixed header size for v1 envelopes. |
| `KeyPair`, `Keys` | Deterministic seed derivation, ephemeral X25519 generation, ECDH, and public-key byte conversion. |
| `ChatEnvelope` | Value object whose `encode`/`decode` implement the v1 binary envelope. |
| `isChatMessage` | Safely recognizes the v1 version/protocol prefix without fully decoding. |
| `Crypto` | Encrypts messages/replies and decrypts as either sender or recipient using X25519, HKDF-SHA256, and ChaCha20-Poly1305. |
| Internal payload codec | Encodes structured text/reply JSON, decodes structured or legacy UTF-8 payloads, and recognizes key-publish JSON. |
| `MessagePayload`, `ReplyToPayload`, `DecryptedContent` | Serializable structured payload and decoded public content types. |
| `Signature` | Ed25519 signing/verification for encryption keys and stable SHA-256 fingerprints. |
| `PQ`, `PQProtocol` | ML-KEM-768 from the account seed, hybrid session key, one-note handshake, steady-state message, and ACPQ announcement. |
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
| `fingerprint` | Formats the first eight SHA-256 bytes as uppercase hexadecimal in four space-separated groups. |
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

### Hybrid ML-KEM export index

`PQ.kt` is a shipped low-level API. The high-level client does not dispatch the handshake/data notes automatically.

| Export | Contract |
|---|---|
| `PQProtocol` | Wire/constants namespace: `VERSION` 0x02, `HANDSHAKE_ID` 0x04, `DATA_ID` 0x05, `MLKEM_EK_SIZE` 1184, `MLKEM_CT_SIZE` 1088, `EK_HASH_SIZE` 32, `ENCRYPTED_SESSION_KEY_SIZE` 48, `HANDSHAKE_SIZE` 2366, `DATA_HEADER_SIZE` 78, and `MAX_PAYLOAD_SIZE` 4002. |
| `PQProtocol.ANNOUNCE_MAGIC`, `ANNOUNCE_VERSION`, `ANNOUNCE_UNSIGNED_SIZE`, `ANNOUNCE_SIGNED_SIZE` | ACPQ prefix, version 0x01, unsigned size 1189, signed size 1253. |
| `MLKEMKeyPair` | `encapsKey` bytes and `decapsulationKey` Bouncy Castle object seeded from HKDF-derived d || z; value equality/hashing compare the encapsulation key and retained seed. |
| `MLKEMEncapsulation` | `ciphertext` and `sharedSecret` byte arrays with content equality/hash. |
| `PQSession` | `sessionKey`, `senderPublicKey`, `recipientPublicKey`, and `handshakeId` arrays with content equality/hash; id is SHA-256 of the handshake note. |
| `PQAnnouncement` | Parsed `encapsKey` and `isVerified` fields with content equality/hash. |
| `PQHandshake` | Handshake `note` bytes and sender `session`. |
| `PQ` | Namespace for the hybrid session and announcement operations below. |
| `deriveMLKEMKeyPair` | Derives ML-KEM-768 from an exact 32-byte account seed through fixed HKDF d/z domains. |
| `encapsulate` | Returns `MLKEMEncapsulation`; optional explicit randomness supports deterministic vectors, otherwise uses a CSPRNG. |
| `decapsulate` | Recovers a shared secret using the recipient ML-KEM key pair. |
| `deriveHybridPQKey` | HKDF-combines X25519 then ML-KEM secrets and binds identities, ephemeral key, KEM ciphertext, and encapsulation-key hash. |
| `initiatePQSession` | Returns the one-note handshake and sender session; optional explicit randomness supports vectors. |
| `acceptPQSession` | Checks recipient identity and key hash and reconstructs a recipient session. |
| `openPQSessionAsSender` | Reopens sent history with sender X25519 and ML-KEM secrets. |
| `encryptPQMessage` | Encrypts at most 4002 UTF-8 bytes with fresh nonce and full 78-byte data-header AAD. |
| `decryptPQMessage` | Checks session identity, authenticates the header/data, and returns plaintext. |
| `isPQHandshake`, `isPQMessage` | Recognize handshake/data version, id, and structural length. |
| `pqAnnouncementSigningInput` | SHA-256 digest of announcement signing label, version, and encapsulation key. |
| `encodePQKeyAnnouncement` | Emits unsigned or Ed25519-signed ACPQ key announcements. |
| `parsePQKeyAnnouncement` | Returns an unverified unsigned or verified signed announcement; malformed/invalid signed input returns null. |
| `isPQKeyAnnouncement` | Recognizes the ACPQ prefix before standard key parsing. |

Each parsed member below has the following owning-type meaning (some unqualified names also occur in the standard API):

| Export | Contract |
|---|---|
| `HANDSHAKE_ID` | PQ handshake protocol discriminator, 0x04. |
| `DATA_ID` | PQ data protocol discriminator, 0x05. |
| `MLKEM_EK_SIZE` | Encapsulation key width, 1184 bytes. |
| `MLKEM_CT_SIZE` | KEM ciphertext width, 1088 bytes. |
| `EK_HASH_SIZE` | Encapsulation-key SHA-256 hash width, 32 bytes. |
| `ENCRYPTED_SESSION_KEY_SIZE` | Wrapped session-key width, 48 bytes. |
| `HANDSHAKE_SIZE` | PQ one-note handshake width, 2366 bytes. |
| `DATA_HEADER_SIZE` | PQ data authenticated header width, 78 bytes. |
| `ANNOUNCE_MAGIC` | ACPQ prefix bytes. |
| `ANNOUNCE_VERSION` | ACPQ format version, 0x01. |
| `ANNOUNCE_UNSIGNED_SIZE` | Unsigned ACPQ note width, 1189 bytes. |
| `ANNOUNCE_SIGNED_SIZE` | Signed ACPQ note width, 1253 bytes. |
| `encapsKey` | ML-KEM encapsulation key bytes in key-pair/announcement values. |
| `decapsulationKey` | Bouncy Castle private-key material in `MLKEMKeyPair`. |
| `sharedSecret` | ML-KEM shared secret in `MLKEMEncapsulation`. |
| `sessionKey` | Hybrid symmetric key in `PQSession`. |
| `recipientPublicKey` | Recipient X25519 identity in the session and parsed handshake. |
| `handshakeId` | SHA-256 identifier binding a data note to its handshake. |
| `isVerified` | Whether ACPQ Ed25519 signature verification succeeded. |
| `note` | Encoded handshake bytes in `PQHandshake`. |
| `session` | Sender-side established session in `PQHandshake`. |
| `kemCiphertext` | Recipient ML-KEM ciphertext in the private parsed-handshake record; surfaced by the member parser, not a public library operation. |
| `encapsKeyHash` | Recipient encapsulation-key hash in the private parsed-handshake record. |
| `senderKemCiphertext` | Sender ML-KEM ciphertext in the private parsed-handshake record. |
| `wrappedSessionKey` | Sender's encrypted session-key copy in the private parsed-handshake record. |
| `isPQHandshake` | Recognizes the exact handshake length and version/id bytes. |
| `isPQMessage` | Recognizes minimum PQ data length and version/id bytes. |

`PQTest` uses the committed `vectors/pq-mlkem768.json` for native deterministic parity. The legacy sibling-fixture suite is separate and conditional. See the [accuracy ledger](../../../docs/ACCURACY.md).

## Invariants

1. A v1 envelope is version byte, protocol byte, 32-byte sender key, 32-byte ephemeral key, 12-byte nonce, 48-byte encrypted sender key, then authenticated ciphertext.
2. Encryption uses a fresh ephemeral X25519 pair and nonce; HKDF context binds the expected sender and recipient keys.
3. Both sender and recipient can decrypt the same envelope, but unrelated private keys cannot authenticate it.
4. Reply metadata is optional; decoding valid legacy UTF-8 plaintext remains backward compatible.
5. Key announcements sign exactly the encryption public-key bytes with Ed25519 and fingerprints are the first eight SHA-256 bytes, uppercase hexadecimal grouped as four groups of four characters.
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
| `InvalidEnvelope` | The version is neither `0x01` nor `0x02`, or the protocol marker is unsupported by this codec. | Reject instead of attempting incompatible decryption. |
| `DecryptionFailed` | AEAD authentication fails or the envelope is not for the supplied identity. | Return no unauthenticated plaintext. |
| `InvalidPublicKey` / `IllegalArgumentException` | A key or fixed-size input is malformed. | Reject according to the owning key/codec API. |
| Legacy payload fallback | Structured payload parsing does not yield a supported payload. | Return the text fallback; there is no `InvalidPayload` exception in this API. |
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
