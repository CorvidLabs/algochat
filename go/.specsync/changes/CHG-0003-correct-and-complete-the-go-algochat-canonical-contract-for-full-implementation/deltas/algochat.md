## MODIFIED

### SPEC SECTION Public API

The package exposes the following existing symbols. It does not implement high-level network send, receive, discovery, or transaction orchestration.

| Export | Contract |
|--------|----------|
| `ProtocolVersion` | Version-one envelope byte |
| `ProtocolIDStandard` | Standard envelope protocol byte |
| `ProtocolIDPSK` | Reserved pre-shared-key protocol byte |
| `HeaderSize` | Fixed encoded envelope header size |
| `TagSize` | ChaCha20-Poly1305 authentication-tag size |
| `EncryptedKeySize` | Wrapped symmetric-key size |
| `MaxPayloadSize` | Maximum plaintext accepted by encryption |
| `MinPayment` | Minimum payment amount in microAlgos |
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

### SPEC SECTION Error Cases

| Error | When | Behavior |
|-------|------|----------|
| Invalid envelope | The note is too short or has an unsupported version or protocol ID | `DecodeEnvelope` returns an `ErrInvalidEnvelope`-wrapped error |
| Oversized message | Plaintext passed to encryption exceeds `MaxPayloadSize` | `EncryptMessage` returns an `ErrMessageTooLarge`-wrapped error |
| Wrong or tampered key material | Authenticated decryption cannot validate ciphertext or the encrypted sender key | Decryption returns an `ErrDecryptionFailed`-wrapped error |
| Invalid signature input | An Ed25519 key or signature has an unsupported length | Signing or verification returns the corresponding length error |
| Full queue | Enqueue would exceed the configured queue capacity | `Enqueue` returns `ErrQueueFull` |
| Missing stored key | A requested address has no private key | `Retrieve` returns `ErrKeyNotFound` |

### REQUIREMENT REQ-algochat-001

The package SHALL derive X25519 keys and encrypt and decrypt version-one AlgoChat payloads with authenticated recipient and sender recovery.

Acceptance Criteria
- Reusing the same account seed derives the same X25519 key pair, while ephemeral encryption produces distinct ciphertext and nonce material.
- Plaintext at `MaxPayloadSize` round-trips for the intended recipient and original sender; larger plaintext, an unrelated private key, or tampered authenticated data returns an error.
- Reply encryption serializes reply ID and preview context, truncating previews longer than 80 bytes to a 77-byte prefix plus an ellipsis.
- Key-publish JSON decrypts to no chat content, and ordinary or reply JSON decrypts to the documented `DecryptedContent` fields.

### REQUIREMENT REQ-algochat-002

The package SHALL sign and verify X25519 encryption public keys with Ed25519 and produce deterministic human-readable key fingerprints.

Acceptance Criteria
- A correctly signed encryption key verifies with its matching Ed25519 public key; a different signing key or encryption key does not verify.
- Invalid Ed25519 private-key, public-key, and signature lengths return explicit errors.
- Repeated `Fingerprint` or `KeyFingerprint` calls for the same key return four uppercase hexadecimal groups derived from the first eight SHA-256 bytes.

### REQUIREMENT REQ-algochat-003

Queue and in-memory storage primitives SHALL preserve their configured limits, state transitions, ordering, isolation, retry, missing-key, and expiry behavior.

Acceptance Criteria
- A send queue defaults non-positive capacity to 100 and non-positive retry limits to three, rejects enqueue at capacity, returns the first pending message, and records sending, sent, pending-retry, or terminal-failed transitions using retry count and maximum retries.
- Queue removal, sent/failed purges, failed retry, clear, counts, capacity, pending-state queries, and snapshots operate on the matching messages without exposing the backing slice.
- Message storage deduplicates by message ID per participant, orders by timestamp, filters by rounds strictly greater than the supplied round, and clears messages and sync rounds at global or participant scope.
- Private-key storage reports `ErrKeyNotFound` for an absent address, and public-key cache retrieval removes expired entries while invalidate, clear, and prune remove their selected entries.

### REQUIREMENT REQ-algochat-004

Repository governance SHALL build, vet, and race-test every Go package while preserving the Go 1.22 through 1.24 compatibility matrix and the independent unified Trust gate.

Acceptance Criteria
- `go build ./...`, `go vet ./...`, and `go test -v -race -count=1 ./...` complete successfully in the native verification lane.
- Pull requests and protected-main pushes changing Go sources, module files, canonical specs, SpecSync state, Trust policy inputs, Fledge configuration, or either governance workflow schedule the unchanged Go 1.22, 1.23, and 1.24 matrix.
- The Trust workflow runs on every pull request and protected-main push with full history, Go 1.25, and the immutable Trust 1.0.0 action commit.
- Verification does not represent unfinished high-level send, receive, key-discovery, or live-network orchestration as implemented.

## ADDED

### REQUIREMENT REQ-algochat-005

The envelope codec SHALL encode and decode the standard version-one transaction-note layout without claiming a decode-time plaintext-size limit.

Acceptance Criteria
- Encoding writes version, protocol ID, sender key, ephemeral key, nonce, encrypted sender key, and ciphertext at the documented offsets, and decoding reconstructs those fields.
- Decoding rejects data shorter than two bytes, unsupported versions, unsupported protocol IDs, and data shorter than `HeaderSize + TagSize`.
- `IsChatMessage` returns true exactly when at least two bytes contain the supported version and standard protocol ID.

### REQUIREMENT REQ-algochat-006

Conversation models SHALL maintain a synchronized, deduplicated, chronological view of messages and expose deterministic queries without returning the backing message slice.

Acceptance Criteria
- Append and merge ignore duplicate message IDs and sort newly accepted messages by timestamp.
- Last-message and direction-specific queries return the expected message or nil, and round/direction filters, lookup, count, highest-round, and clear reflect current content.
- Send option constructors progressively enable confirmation and indexer waiting while retaining the default ten-round and 30-second timeouts.

### REQUIREMENT REQ-algochat-007

Account constructors and blockchain boundary types SHALL expose the existing synchronous Algod and Indexer contracts without performing network orchestration.

Acceptance Criteria
- Constructing from a seed preserves the supplied address and Ed25519 public key and stores the deterministically derived X25519 key pair.
- Constructing from a 64-byte secret key uses bytes 0 through 31 as the seed and bytes 32 through 63 as the Ed25519 public key and produces the same account as direct seed construction.
- Algod and Indexer interfaces remain dependency boundaries only; no high-level client implementation is claimed.
