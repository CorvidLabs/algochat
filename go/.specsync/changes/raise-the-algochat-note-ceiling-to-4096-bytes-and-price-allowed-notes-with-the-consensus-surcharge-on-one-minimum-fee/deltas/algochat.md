## MODIFIED

### SPEC SECTION Purpose

Provide the existing Go primitives for AlgoChat encryption, envelope encoding, signing, account derivation, message models, offline queues, and in-memory storage while the high-level client remains under development. Standard plaintext is limited to 3954 bytes so the encoded note is at most 4096 bytes. An allowed note fee is one minimum fee plus the consensus surcharge past 1024 bytes.

### SPEC SECTION Public API

The package exposes the following existing symbols. It does not implement high-level network send, receive, discovery, or transaction orchestration.

| Export | Contract |
|--------|----------|
| `ProtocolVersion` | Version-one envelope byte |
| `ProtocolIDStandard` | Standard envelope protocol byte |
| `ProtocolIDPSK` | Reserved pre-shared-key protocol byte |
| `HeaderSize` | Fixed encoded envelope header size, 126 bytes |
| `TagSize` | ChaCha20-Poly1305 authentication-tag size, 16 bytes |
| `EncryptedKeySize` | Wrapped symmetric-key size |
| `MaxNoteSize` | Maximum allowed transaction note, 4096 bytes |
| `MaxPayloadSize` | Maximum standard plaintext accepted by encryption, 3954 bytes |
| `MinPayment` | Minimum payment amount in microAlgos |
| `PaymentFee` | Fee for an allowed note: one minimum fee plus the rounded surcharge past 1024 bytes |
| `NonceSize` | AEAD nonce size |
| `KeySize` | X25519 and symmetric-key size |
| `Ed25519SignatureSize` | Accepted Ed25519 signature size |
| `Ed25519PublicKeySize` | Accepted Ed25519 public-key size |
| `DefaultPublicKeyTTL` | Default 24-hour public-key cache duration |
| `DirectionSent` | Sent message direction |
| `DirectionReceived` | Received message direction |
| `StatusPending` | Queue entry awaiting an attempt |
| `StatusSending` | Queue entry in an active attempt |
| `StatusSent` | Successfully submitted queue entry |
| `StatusFailed` | Terminally failed queue entry |
| `ErrInvalidSeedLength` | Retained invalid-seed sentinel |
| `ErrMessageTooLarge` | Encryption plaintext exceeds capacity |
| `ErrNoteTooLarge` | Note length is negative or greater than `MaxNoteSize` |
| `ErrDecryptionFailed` | Authenticated decryption failure |
| `ErrInvalidEnvelope` | Structurally unsupported envelope |
| `ErrInvalidKeyLength` | Unsupported Ed25519 key length |
| `ErrInvalidSignatureLength` | Unsupported Ed25519 signature length |
| `ErrQueueFull` | Queue capacity reached |
| `ErrKeyNotFound` | Private key absent from storage |
| `X25519KeyPair` | Fixed-size encryption key pair |
| `DeriveEncryptionKeys` | Deterministically derive X25519 keys from a seed |
| `GenerateEphemeralKeyPair` | Generate a random X25519 pair |
| `EncryptMessage` | Encrypt a standard payload for recipient and sender recovery |
| `EncryptReply` | Encode reply context and encrypt it |
| `DecryptMessage` | Decrypt as recipient or original sender |
| `Fingerprint` | Format an X25519 key fingerprint |
| `SignEncryptionKey` | Sign an encryption key with Ed25519 |
| `VerifyEncryptionKey` | Verify an Ed25519 encryption-key signature |
| `KeyFingerprint` | Format an encryption-key fingerprint |
| `EncodeEnvelope` | Serialize a transaction-note envelope |
| `DecodeEnvelope` | Parse and structurally validate an envelope |
| `IsChatMessage` | Recognize the supported two-byte header |
| `SuggestedParams` | Transaction parameter value object |
| `AccountInfo` | Account balance value object |
| `TransactionInfo` | Confirmation value object |
| `NoteTransaction` | Indexed note-transaction value object |
| `AlgodClient` | Synchronous Algod dependency boundary |
| `IndexerClient` | Synchronous Indexer dependency boundary |
| `ChatAccount` | Address and derived encryption identity |
| `NewChatAccountFromSeed` | Construct an account from seed and Ed25519 public key |
| `NewChatAccountFromSecretKey` | Construct an account from a 64-byte secret key |
| `GetSuggestedParams` | Algod parameter operation |
| `GetAccountInfo` | Algod account operation |
| `SubmitTransaction` | Algod submission operation |
| `WaitForConfirmation` | Algod confirmation operation |
| `GetCurrentRound` | Algod round operation |
| `SearchTransactions` | Indexer address-search operation |
| `SearchTransactionsBetween` | Indexer participant-pair search operation |
| `GetTransaction` | Indexer transaction lookup |
| `WaitForIndexer` | Indexer availability wait operation |
| `MessageDirection` | Sent/received direction type |
| `ChatEnvelope` | Encoded encrypted-message fields |
| `DecryptedContent` | Plaintext and optional reply context |
| `ReplyContext` | Message reply identifier and preview |
| `Message` | Decrypted chat-message model |
| `PendingStatus` | Queue lifecycle status type |
| `PendingMessage` | Queued message and retry state |
| `DiscoveredKey` | On-chain public-key discovery record |
| `SendResult` | Submitted-message result model |
| `SendOptions` | Confirmation, indexer, reply, and amount options |
| `DefaultSendOptions` | Construct fire-and-forget defaults |
| `ConfirmedSendOptions` | Construct confirmation-waiting defaults |
| `IndexedSendOptions` | Construct confirmation-and-indexer defaults |
| `Conversation` | Synchronized participant message collection |
| `NewConversation` | Construct an empty participant conversation |
| `Messages` | Copy the chronological message slice |
| `MessageCount` | Count conversation messages |
| `IsEmpty` | Report whether a collection has no entries |
| `LastMessage` | Return the latest chronological message |
| `LastReceived` | Return the latest received message |
| `LastSent` | Return the latest sent message |
| `Append` | Add a unique message and maintain ordering |
| `Merge` | Add unique messages and maintain ordering |
| `HasMessage` | Test conversation membership by ID |
| `GetMessage` | Look up a conversation message by ID |
| `MessagesAfterRound` | Filter messages by exclusive confirmed-round lower bound |
| `MessagesInDirection` | Filter messages by direction |
| `HighestRound` | Return the maximum confirmed round |
| `Clear` | Clear the receiver's stored entries |
| `SendQueue` | Synchronized offline send queue |
| `NewSendQueue` | Construct a bounded queue |
| `Enqueue` | Add a pending queue entry |
| `Dequeue` | Return the first pending queue entry |
| `Get` | Look up a queue entry by ID |
| `MarkSending` | Record an attempt and increment retry count |
| `MarkSent` | Record successful submission and transaction ID |
| `MarkFailed` | Return to pending or become terminally failed |
| `Remove` | Delete a selected queue entry |
| `PurgeSent` | Remove all sent entries |
| `PurgeFailed` | Remove all terminally failed entries |
| `RetryFailed` | Reset retry-eligible failed entries |
| `Size` | Count all queue entries |
| `QueuedCount` | Count pending queue entries |
| `HasPending` | Report pending or sending work |
| `IsFull` | Report capacity exhaustion |
| `All` | Copy all queue entries |
| `MessageCache` | Message-cache storage contract |
| `InMemoryMessageCache` | Synchronized in-memory message cache |
| `NewInMemoryMessageCache` | Construct empty message and sync-round maps |
| `Store` | Store messages or key material by receiver context |
| `Retrieve` | Retrieve messages or key material by receiver context |
| `GetLastSyncRound` | Read a participant sync round |
| `SetLastSyncRound` | Store a participant sync round |
| `GetCachedConversations` | List participants with cached messages |
| `ClearFor` | Clear one participant's messages and sync round |
| `EncryptionKeyStorage` | Private encryption-key storage contract |
| `InMemoryKeyStorage` | Synchronized in-memory private-key map |
| `NewInMemoryKeyStorage` | Construct an empty private-key map |
| `HasKey` | Report whether an address has a private key |
| `Delete` | Delete one stored private key |
| `ListAddresses` | List addresses with private keys |
| `PublicKeyCache` | Expiring in-memory public-key cache |
| `NewPublicKeyCache` | Construct a cache with the supplied TTL |
| `Invalidate` | Remove one cached public key |
| `PruneExpired` | Remove all expired public keys |

### SPEC SECTION Invariants

1. Message encryption accepts plaintext up to `MaxPayloadSize`, uses a fresh ephemeral X25519 key pair and nonce, authenticates ciphertext with ChaCha20-Poly1305, and permits the intended recipient or original sender to decrypt with the corresponding private key.
2. Envelope decoding accepts only the standard version-one protocol header and at least the fixed header plus authentication tag; it copies the remaining bytes as ciphertext and does not independently enforce the encryption-time plaintext limit.
3. Encryption-key signatures use Ed25519 with explicit public-key and signature length validation; both fingerprint helpers deterministically format the first eight SHA-256 bytes as four uppercase groups.
4. Account constructors derive the same X25519 key pair from the same 32-byte seed and split a 64-byte Algorand secret key into its seed and Ed25519 public-key halves.
5. Conversation, queue, and in-memory storage operations synchronize shared state and preserve their documented ordering, deduplication, capacity, retry, participant-isolation, missing-key, and expiry behavior.
6. The Go compatibility matrix and unified Trust gate remain independent blocking workflows, and this migration does not claim the unfinished high-level client is implemented.
7. An 882-byte standard plaintext encrypts and encodes to 1024 bytes. A plaintext of `MaxPayloadSize` (3954 bytes) encodes to exactly `MaxNoteSize` (4096 bytes). One additional byte fails in `EncryptMessage` with `ErrMessageTooLarge` before an envelope is returned. `PaymentFee` at minFee 1000 returns 1000, 1098, and 1308 microAlgos for notes of 1024, 2000, and 4096 bytes. A 4097-byte note returns `ErrNoteTooLarge`. The fee scheme is one minimum fee because this package has no Falcon signer. Protocol ID `0x02` stays reserved and does not add a PSK payload limit.

### SPEC SECTION Behavioral Examples

```
Given two valid AlgoChat accounts and a plaintext within the protocol limit
When one account encrypts and encodes a message for the other
Then the recipient can decode and authenticate the original plaintext while an unrelated key cannot
```

```
Given a 3954-byte plaintext and a minimum fee of 1000 microAlgos
When the message is encrypted, encoded, and priced with PaymentFee
Then the note is 4096 bytes and the fee is 1308 microAlgos
```

### SPEC SECTION Error Cases

| Error | When | Behavior |
|-------|------|----------|
| Invalid envelope | The note is too short or has an unsupported version or protocol ID | `DecodeEnvelope` returns an `ErrInvalidEnvelope`-wrapped error |
| Oversized message | Plaintext passed to encryption exceeds `MaxPayloadSize` | `EncryptMessage` returns an `ErrMessageTooLarge`-wrapped error before an envelope is returned |
| Note too large | `PaymentFee` is asked for a negative length or a note longer than `MaxNoteSize` | `PaymentFee` returns an `ErrNoteTooLarge`-wrapped error |
| Wrong or tampered key material | Authenticated decryption cannot validate ciphertext or the encrypted sender key | Decryption returns an `ErrDecryptionFailed`-wrapped error |
| Invalid signature input | An Ed25519 key or signature has an unsupported length | Signing or verification returns the corresponding length error |
| Full queue | Enqueue would exceed the configured queue capacity | `Enqueue` returns `ErrQueueFull` |
| Missing stored key | A requested address has no private key | `Retrieve` returns `ErrKeyNotFound` |

### SPEC SECTION Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1 | 2026-07-12 | Initial spec |
| 2026-07-13 | CHG-0001-adopt-specsync-5-0-1-and-trust-1-0-0-governance-for-the-go-algochat-primitives: Adopt SpecSync 5.0.1 and Trust 1.0.0 governance for the Go AlgoChat primitives |
| 3 | 2026-07-14 | CHG-0003-correct-and-complete-the-go-algochat-canonical-contract-for-full-implementation: Correct and complete the Go AlgoChat canonical contract for full implementation and governance coverage |
| 4 | 2026-10-16 | Raise the note ceiling to 4096 bytes. Max standard plaintext is 3954. PaymentFee adds the note surcharge to one minimum fee |

### REQUIREMENT REQ-algochat-001

The package SHALL derive X25519 keys and encrypt and decrypt version-one AlgoChat payloads with authenticated recipient and sender recovery.

Acceptance Criteria
- Reusing the same account seed derives the same X25519 key pair, while ephemeral encryption produces distinct ciphertext and nonce material.
- An 882-byte plaintext encrypts and encodes to 1024 bytes. Plaintext at `MaxPayloadSize` (3954 bytes) round-trips for the intended recipient and original sender and encodes to exactly 4096 bytes. One byte past `MaxPayloadSize` returns `ErrMessageTooLarge` before an envelope is produced. An unrelated private key or tampered authenticated data returns an error.
- Reply encryption serializes reply ID and preview context, truncating previews longer than 80 bytes to a 77-byte prefix plus an ellipsis.
- Key-publish JSON decrypts to no chat content, and ordinary or reply JSON decrypts to the documented `DecryptedContent` fields.

## ADDED

### REQUIREMENT REQ-algochat-008

The package SHALL price an allowed note as one minimum fee plus the consensus surcharge, and SHALL reject a note larger than `MaxNoteSize` before returning a fee.

Acceptance Criteria
- `PaymentFee` at minFee 1000 returns 1000 for 1024 bytes, 1098 for 2000 bytes, and 1308 for 4096 bytes.
- A negative length or 4097 bytes returns `ErrNoteTooLarge`.
- The scheme component is one minimum fee. This package does not provide a Falcon signer.
