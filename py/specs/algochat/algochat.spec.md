---
module: algochat
version: 8
status: active
files:
  - src/algochat/__init__.py
  - src/algochat/blockchain.py
  - src/algochat/client.py
  - src/algochat/crypto.py
  - src/algochat/envelope.py
  - src/algochat/keys.py
  - src/algochat/models.py
  - src/algochat/pq.py
  - src/algochat/group_admin.py
  - src/algochat/http_clients.py
  - src/algochat/psk_crypto.py
  - src/algochat/psk_envelope.py
  - src/algochat/psk_exchange.py
  - src/algochat/psk_ratchet.py
  - src/algochat/psk_state.py
  - src/algochat/psk_types.py
  - src/algochat/queue.py
  - src/algochat/signature.py
  - src/algochat/storage.py
  - src/algochat/transaction.py
  - src/algochat/types.py

db_tables: []
depends_on: []
---

# Python AlgoChat Protocol

## Purpose

Implement encrypted AlgoChat messaging for Algorand in Python, including interoperable envelopes, X25519 and PSK cryptography, replay-safe ratchet state, blockchain transport abstractions, queues, signatures, and key storage.

## Public API

The `algochat` package exports the client, model, cryptographic, envelope, PSK, queue, signature, storage, and transport interfaces.

| Export | Contract |
|---|---|
| `GROUP_MEMBERSHIP_NOTE_SIZE` | Room administration symbol. |
| `GROUP_MAX_PAYLOAD_SIZE` | Room administration symbol. |
| `GroupMembership` | Room administration symbol. |
| `GroupCounter` | Room administration symbol. |
| `OpenedGroupMessage` | Room administration symbol. |
| `is_group_membership` | Room administration symbol. |
| `is_group_message` | Room administration symbol. |
| `seal_group_membership` | Room administration symbol. |
| `open_group_membership` | Room administration symbol. |
| `derive_group_message_key` | Room administration symbol. |
| `seal_group_message` | Room administration symbol. |
| `open_group_message` | Room administration symbol. |
| `GROUP_ADMIN_PROTOCOL` | Room administration symbol. |
| `GROUP_DELIVER_ACTION` | Room administration symbol. |
| `GROUP_NAME_MAX` | Room administration symbol. |
| `GROUP_ADMIN_MAX` | Room administration symbol. |
| `GROUP_MEMBER_MAX` | Maximum members, 256. A full-list note that does not fit in 4096 bytes is rejected. New notes omit the member list. |
| `GROUP_DELIVER_BATCH` | Separate key-delivery payments in one pass, at most 16. Not an atomic group. |
| `GROUP_MEMBERS_OMITTED` | Member-count sentinel 65535. The note names one subject and omits the roster. |
| `GROUP_DELIVER_PLAINTEXT_SIZE` | Room administration symbol. |
| `JOINING_INVITE` | Room administration symbol. |
| `JOINING_ASK` | Room administration symbol. |
| `OP_CREATE` | Room administration symbol. |
| `OP_SET_NAME` | Room administration symbol. |
| `OP_SET_POLICY` | Room administration symbol. |
| `OP_APPOINT_ADMIN` | Room administration symbol. |
| `OP_DISMISS_ADMIN` | Room administration symbol. |
| `OP_TRANSFER_OWNER` | Room administration symbol. |
| `OP_ADD_MEMBER` | Room administration symbol. |
| `OP_REQUEST_JOIN` | Room administration symbol. |
| `OP_ACCEPT_JOIN` | Room administration symbol. |
| `OP_DECLINE_JOIN` | Room administration symbol. |
| `OP_REMOVE_MEMBER` | Room administration symbol. |
| `OP_REKEY` | Room administration symbol. |
| `draft_admin` | Drafts an authorized 0x03 note that omits the member list. |
| `reduce_admin` | Reduces administration transactions into one room. Full-list notes still open. |
| `sender_may_post` | Whether a member may post at an epoch. |
| `delivery_authorized` | Whether one accepted record authorizes a key delivery. |
| `encode_admin_record` | Encodes one 0x03 note. |
| `authorized_recipients` | Members authorized to receive the key for one accepted record. |
| `channel_departures` | Channel members who are no longer in the parent room. |
| `pending_key_deliveries` | Recipients still owed a key. A landed payment stays landed. |
| `next_delivery_batch` | The next separate key payments, at most 16. |
| `seal_group_key_delivery` | Seals a 227-byte 0x06 action-5 delivery. |
| `open_group_key_delivery` | Opens a 227-byte 0x06 action-5 delivery. |
| `RoomState` | Accepted room roster. |
| `AdminEvent` | One administration transaction. |
| `AcceptedAdmin` | One accepted administration record. |
| `RejectedAdmin` | One rejected administration transaction. |
| `ReduceAdminResult` | Reducer output. |
| `GroupKeyDelivery` | Opened action-5 delivery. |
| `derive_keys_from_seed` | Derives a deterministic X25519 private/public key pair from a 32-byte seed with HKDF-SHA256. |
| `generate_ephemeral_keypair` | Generates a random ephemeral X25519 key pair for message encryption. |
| `encrypt_message` | Encrypts authenticated message content for a recipient and returns a standard AlgoChat envelope. |
| `decrypt_message` | Decrypts a standard envelope as its intended recipient or originating sender. |
| `encode_envelope` | Serializes a standard `ChatEnvelope` into the protocol wire format. |
| `decode_envelope` | Validates and parses standard protocol bytes into a `ChatEnvelope`. |
| `is_chat_message` | Reports whether bytes have a structurally valid standard AlgoChat envelope header. |
| `ChatEnvelope` | Stores the standard envelope version, keys, nonce, ciphertext, and authentication tag. |
| `DecryptedContent` | Represents decrypted plaintext together with sender identity and key-publication metadata. |
| `sign_encryption_key` | Signs an encryption public key with an Ed25519 signing key. |
| `verify_encryption_key` | Verifies an encryption-key signature with an Ed25519 verification key. |
| `verify_encryption_key_bytes` | Verifies an encryption-key signature from raw Ed25519 public-key bytes. |
| `fingerprint` | Produces the human-readable fingerprint of an encryption public key. |
| `SIGNATURE_SIZE` | Defines the Ed25519 signature length as 64 bytes. |
| `ReplyContext` | Links a reply to the original transaction, sender, and optional excerpt. |
| `MessageDirection` | Distinguishes sent messages from received messages. |
| `Message` | Models a chat message, its transaction metadata, direction, status, and reply context. |
| `Conversation` | Aggregates messages and unread state for two Algorand addresses. |
| `DiscoveredKey` | Stores a discovered X25519 public key and whether its optional Ed25519 signature verified. |
| `SendOptions` | Configures confirmation and indexer waits, their timeouts, and optional reply context. |
| `SendResult` | Stores the transaction identifier and resulting sent `Message`. |
| `PendingStatus` | Represents queued, sending, failed, and sent delivery states. |
| `PendingMessage` | Stores an offline outgoing message, retry metadata, and current pending status. |
| `MessageCache` | Defines asynchronous message persistence and lookup operations. |
| `InMemoryMessageCache` | Implements `MessageCache` with process-local storage. |
| `PublicKeyCache` | Caches discovered public keys in memory with TTL expiration. |
| `EncryptionKeyStorage` | Defines asynchronous private-key storage, retrieval, deletion, and existence checks. |
| `InMemoryKeyStorage` | Provides test-oriented process-local encryption-key storage. |
| `FileKeyStorage` | Persists encryption private keys in an at-rest encrypted filesystem format. |
| `AlgoChatError` | Provides the base exception for AlgoChat failures. |
| `InvalidPublicKeyError` | Reports an invalid public-key format or length. |
| `KeyDerivationError` | Reports failure to derive required cryptographic key material. |
| `InvalidSignatureError` | Reports malformed or unverifiable signature data. |
| `EncryptionError` | Reports failure to encrypt a standard message. |
| `DecryptionError` | Reports failure to authenticate or decrypt a standard message. |
| `InvalidEnvelopeError` | Reports an invalid standard envelope format. |
| `IndexerNotConfiguredError` | Reports an operation that requires an unconfigured indexer. |
| `PublicKeyNotFoundError` | Reports that no encryption public key was found for an address. |
| `UnverifiedKeyError` | Reports a discovered encryption key that failed Ed25519 verification. |
| `InvalidRecipientError` | Reports an invalid recipient address. |
| `TransactionError` | Reports failure to construct, submit, or confirm a transaction. |
| `InsufficientBalanceError` | Reports that an account cannot fund the required transaction. |
| `KeyNotFoundError` | Reports a missing key in configured storage. |
| `StorageError` | Reports a key or message storage operation failure. |
| `MessageNotFoundError` | Reports that a requested message is absent. |
| `MINIMUM_PAYMENT` | Defines the 1,000 microAlgo payment used to carry an AlgoChat note. |
| `payment_fee` | Returns the microAlgo fee for a note-carrying payment. The first 1024 bytes cost one minimum fee. Each byte past 1024 adds one ten-thousandth of the minimum fee, rounded up once. There is no Falcon signer, so the scheme component is one minimum fee. |
| `MAX_NOTE_SIZE` | Caps an AlgoChat transaction note at 4096 bytes. |
| `QueueConfig` | Configures queue retries, retry delay, and processing behavior. |
| `SendQueue` | Manages asynchronous persistence and delivery of pending outgoing messages. |
| `AlgorandConfig` | Configures algod and indexer connection endpoints and credentials. |
| `TransactionInfo` | Records a submitted transaction identifier and confirmation round. |
| `NoteTransaction` | Models a blockchain payment transaction carrying note bytes; `intra_round_offset` (default 0) is its position in the round, from the indexer's `intra-round-offset`. |
| `SuggestedParams` | Models fee, round, genesis, and flat-fee transaction parameters. |
| `AccountInfo` | Models an Algorand account balance and related node response data. |
| `AlgodClient` | Defines asynchronous node operations for parameters, accounts, submission, and confirmation. |
| `IndexerClient` | Defines asynchronous note-transaction lookup for an Algorand address. |
| `discover_encryption_key` | Returns the first valid key announcement in indexer result order for an address. |
| `AlgoChatConfig` | Configures the high-level client, keys, transport clients, caches, and queue. |
| `AlgoChat` | Coordinates encrypted sending, receiving, discovery, storage, and queued delivery. |
| `PSK_VERSION` | Defines the PSK envelope version marker as `0x01`. |
| `PSK_PROTOCOL_ID` | Defines the PSK protocol discriminator as `0x02`. |
| `PSK_HEADER_SIZE` | Defines the PSK fixed header length as 130 bytes. |
| `PSK_TAG_SIZE` | Defines the PSK authentication-tag length as 16 bytes. |
| `PSK_ENCRYPTED_SENDER_KEY_SIZE` | Defines the encrypted sender-key field as 48 bytes. |
| `PSK_MAX_PAYLOAD_SIZE` | Caps a PSK envelope payload at 3950 bytes. |
| `PSK_SESSION_SIZE` | Groups 100 ratchet positions into one derived PSK session. |
| `PSK_COUNTER_WINDOW` | Allows a 200-counter receive window for replay-safe out-of-order delivery. |
| `PSKEnvelope` | Stores PSK envelope counters, keys, nonce, ciphertext, and authentication tag. |
| `derive_session_psk` | Derives a session PSK from the initial PSK and session index. |
| `derive_position_psk` | Derives a position PSK from a session PSK and position. |
| `derive_psk_at_counter` | Derives the position-specific PSK for a global ratchet counter. |
| `derive_hybrid_symmetric_key` | Combines ECDH and PSK material into the message encryption key. |
| `derive_sender_key` | Derives the encrypted sender-key wrapping key for bidirectional decryption. |
| `encode_psk_envelope` | Serializes a `PSKEnvelope` into the PSK wire format. |
| `decode_psk_envelope` | Validates and parses PSK protocol bytes into a `PSKEnvelope`. |
| `is_psk_message` | Reports whether bytes have a structurally valid PSK envelope header. |
| `PSKEnvelopeError` | Reports PSK envelope encoding or decoding failure. |
| `PSKState` | Tracks send counters, received counters, and replay-window state for a PSK conversation. |
| `validate_counter` | Checks whether an incoming counter is new and inside the accepted receive window. |
| `record_receive` | Returns PSK state updated with a successfully received counter. |
| `advance_send_counter` | Returns the current send counter. At 4294967295, marks send state exhausted instead of wrapping to 0. |
| `create_psk_exchange_uri` | Encodes a pre-shared key and exchange metadata into an AlgoChat PSK URI. |
| `parse_psk_exchange_uri` | Validates and decodes an AlgoChat PSK exchange URI. |
| `encrypt_psk_message` | Encrypts authenticated content with the PSK v1.1 hybrid protocol. |
| `decrypt_psk_message` | Decrypts a PSK v1.1 envelope as recipient or originating sender. |
| `PSKEncryptionError` | Reports PSK-specific encryption failure. |
| `PSKDecryptionError` | Reports PSK-specific authentication or decryption failure. |
| `InvalidAddressError` | Reports an Algorand address with invalid encoding, length, or checksum. |
| `EnvelopeError` | Reports standard envelope encoding or decoding failure. |
| `x25519_ecdh` | Performs X25519 Diffie-Hellman key agreement. |
| `public_key_to_bytes` | Serializes an X25519 public key to its 32-byte raw representation. |
| `public_key_from_bytes` | Parses 32 raw bytes into an X25519 public key. |
| `PROTOCOL_VERSION` | Defines the standard envelope version marker as `0x01`. |
| `PROTOCOL_ID` | Defines the standard protocol discriminator as `0x01`. |
| `HEADER_SIZE` | Defines the standard fixed header length as 126 bytes. |
| `TAG_SIZE` | Defines the standard authentication-tag length as 16 bytes. |
| `ENCRYPTED_SENDER_KEY_SIZE` | Defines the encrypted sender-key field as 48 bytes. |
| `MAX_PAYLOAD_SIZE` | Caps a standard envelope payload at 3954 bytes. |
| `NONCE_SIZE` | Defines ChaCha20-Poly1305 nonces as 12 bytes. |
| `PUBLIC_KEY_SIZE` | Defines serialized X25519 public keys as 32 bytes. |
| `KEY_DERIVATION_SALT` | Supplies the fixed `AlgoChat-v1-encryption` HKDF salt for seed derivation. |
| `KEY_DERIVATION_INFO` | Supplies the fixed `x25519-key` HKDF context for seed derivation. |
| `ENCRYPTION_INFO_PREFIX` | Domain-separates standard message encryption with `AlgoChatV1`. |
| `SENDER_KEY_INFO_PREFIX` | Domain-separates sender-key wrapping with `AlgoChatV1-SenderKey`. |
| `build_payment` | Builds the fields of one payment as algod expects them: amount, `payment_fee` for the note, the suggested validity window, genesis id and hash, and both addresses. A note over 4096 bytes or a negative amount raises `TransactionError`. |
| `build_asset_create` | Builds an asset create (`acfg` with no asset id) with the given total, decimals, unit name, asset name, URL, manager and note, and no reserve, freeze or clawback. A total below 1, decimals outside 0 to 19, a unit name over 8 bytes, an asset name over 32, a URL over 96 or a note over 1024 raise `TransactionError`. |
| `build_asset_config` | Builds an asset config on an asset id that keeps the given manager, leaves reserve, freeze and clawback empty and carries the note. An asset id below 1 or a note over 1024 bytes raises `TransactionError`. |
| `sign_payment` | Signs a payment, or an asset create or config, with the sender's 32-byte Ed25519 seed. Canonical msgpack (sorted keys, empty values left out) gives the same transaction id algod computes. A seed that is not the sender's raises `TransactionError`. |
| `SignedPayment` | A signed payment: its transaction id, the signed bytes to submit, and its fee. |
| `send_payment` | Builds, signs, submits and confirms one payment through any `AlgodClient`. A transaction id from algod that differs from the local one raises `TransactionError`. No Algorand SDK is needed. |
| `HttpAlgodClient` | `AlgodClient` over algod's REST API with the standard library. The operator gives an `http://` or `https://` URL and a token; there is no default endpoint and the token is never in `repr` or errors. Confirmation waits poll the pending endpoint and fail on a pool error or after the given rounds. For asset transactions it also reads a pending transaction (`pending_transaction`), the assets an account created (`account_created_assets`), one holding (`asset_holding`, `None` when not opted in) and an asset's params (`asset_params`, `None` when unknown). |
| `HttpIndexerClient` | `IndexerClient` over the indexer's REST API. Payments with a note, newest first as the indexer lists them. With a `limit` a search returns one page; without one it follows the indexer's next tokens and returns every match after `after_round`. `account_created_assets` lists the assets an account created, deleted ones included, and `asset_config_history` the asset-config transactions on one asset, both across every page. |
| `VALIDITY_ROUNDS` | 1000: a payment is valid from the suggested first round for this many rounds. |
| `INDEXER_PAGE_LIMIT` | 1000: the page size an unlimited indexer search asks for. |
| `HttpError` | An algod or indexer request that answered with an HTTP error. Carries the status and body, never the token. |

#### Standard Protocol and Models

The standard protocol surface covers deterministic and ephemeral X25519 keys, authenticated encryption, envelope encoding, key signatures, message models, conversations, replies, and delivery results.

#### Storage, Queue, Transport, and Client

The persistence and transport surface separates message caches, encrypted key storage, queued delivery, Algorand node/indexer abstractions, key discovery, and the high-level `AlgoChat` coordinator.

#### Errors

The explicit exception hierarchy keeps protocol, cryptographic, transport, address, balance, lookup, and persistence failures distinguishable.

#### PSK Protocol

The PSK v1.1 surface covers wire constants, hierarchical ratchet derivation, hybrid authenticated encryption, replay-safe receive state, and exchange URI handling.

### Hybrid ML-KEM session exports

`src/algochat/pq.py` implements the shipped low-level protocol 1.3.0 session API. It is re-exported through `algochat.__init__`; the high-level client does not automatically orchestrate PQ handshakes/data. The 29 public exports are:

| Export | Contract |
|---|---|
| `PQError` | Typed failure for hybrid session derivation, handshake, message authentication, and size checks. |
| `PQ_VERSION` | PQ wire version 0x02. |
| `PQ_HANDSHAKE_ID` | Handshake discriminator 0x04. |
| `PQ_DATA_ID` | Steady-state data discriminator 0x05. |
| `MLKEM_EK_SIZE` | ML-KEM-768 encapsulation key size, 1184 bytes. |
| `MLKEM_CT_SIZE` | ML-KEM-768 ciphertext size, 1088 bytes. |
| `PQ_HANDSHAKE_SIZE` | One-note handshake size, 2366 bytes. |
| `PQ_DATA_HEADER_SIZE` | Steady-state authenticated header size, 78 bytes. |
| `PQ_MAX_PAYLOAD_SIZE` | Maximum PQ plaintext size, 4002 UTF-8 bytes. |
| `PQ_ANNOUNCE_MAGIC` | ACPQ announcement discriminator. |
| `PQ_ANNOUNCE_VERSION` | ACPQ announcement format version 0x01. |
| `MLKEMKeyPair` | Encapsulation key and 64-byte d || z key-generation seed retained as decaps_key. |
| `PQSession` | Session key, sender/recipient X25519 public keys, and SHA-256 handshake identifier. |
| `PQAnnouncement` | Parsed encapsulation key and signature-verification state. |
| `derive_mlkem_keypair` | Derives ML-KEM-768 from a 32-byte account seed through the fixed HKDF d/z domains. |
| `encapsulate` | Returns ML-KEM shared secret and ciphertext for a recipient encapsulation key. |
| `decapsulate` | Recovers a shared secret with a 1088-byte ciphertext and 64-byte d || z seed. |
| `derive_hybrid_pq_key` | HKDF-combines X25519 then ML-KEM secrets while binding both identities, ephemeral key, ciphertext, and encapsulation-key hash. |
| `initiate_pq_session` | Builds the one-note handshake and returns its sender-side session. |
| `accept_pq_session` | Checks recipient/key-hash identity and reconstructs a session from a handshake. |
| `open_pq_session_as_sender` | Reopens sent history using the sender X25519 and ML-KEM secrets. |
| `encrypt_pq_message` | Encrypts a data note with fresh nonce and the full 78-byte data header as AAD. |
| `decrypt_pq_message` | Checks session identity and authenticates a data note before UTF-8 decoding. |
| `is_pq_handshake` | Recognizes the exact handshake length and version/id markers. |
| `is_pq_message` | Recognizes minimum PQ data length and version/id markers. |
| `encode_pq_key_announcement` | Encodes an unsigned or Ed25519-signed ACPQ encapsulation-key note. |
| `parse_pq_key_announcement` | Parses ACPQ announcements; unsigned results are unverified and invalid signatures fail parsing. |
| `is_pq_key_announcement` | Recognizes the ACPQ prefix before standard X25519 announcement parsing. |
| `pq_announcement_signing_input` | SHA-256 digest of the announcement signing label, version, and encapsulation key. |

The following additional constants are public in `algochat.pq` but are not root-package re-exports:

| Export | Contract |
|---|---|
| `MLKEM_DK_SIZE` | Expanded ML-KEM-768 decapsulation key size, 2400 bytes; exported key-pair storage uses the 64-byte seed instead. |
| `MLKEM_SEED_SIZE` | ML-KEM d || z key-generation seed size, 64 bytes. |
| `PQ_EK_HASH_SIZE` | SHA-256 encapsulation-key hash size, 32 bytes. |
| `PQ_HANDSHAKE_ID_SIZE` | SHA-256 handshake identifier size, 32 bytes. |
| `PQ_WRAPPED_KEY_SIZE` | Wrapped 32-byte session key plus authentication tag, 48 bytes. |

`tests/test_pq.py` reads the committed `vectors/pq-mlkem768.json` for ML-KEM parity, the combiner, recipient acceptance and sender reopening, tamper rejection, the 4002-byte payload boundary, and ACPQ exclusion from standard discovery. Legacy standard and PSK messages remain independent formats. See the [accuracy ledger](../../../docs/ACCURACY.md) for behavior gaps and evidence limits.

## Invariants

1. Standard messages use the existing X25519, HKDF-SHA256, and ChaCha20-Poly1305 construction and remain decryptable by the intended recipient and originating sender.
2. Encoded standard and PSK envelopes preserve the established cross-implementation wire format.
3. PSK counters derive deterministic per-message keys, reject replays, allow a 200-counter window in both directions, reject a fresh counter of 1000000, and prune obsolete receive state. Send counter 4294967295 is issued once and then the saved state is exhausted. It does not become 0.
4. File key storage encrypts private material at rest and preserves the interoperable salt, nonce, ciphertext, and tag layout; in-memory storage remains test-only.
5. Blockchain, queue, and client abstractions preserve asynchronous ordering and do not silently discard protocol errors.
6. A standard plaintext is at most 3954 bytes and a PSK plaintext is at most 3950 bytes. Those maxima encode to a 4096-byte note. One extra byte is rejected before a transaction is built. Headers stay 126 and 130 bytes, and the Poly1305 tag stays 16 bytes. Standard decode rejects fewer than 142 bytes and PSK decode rejects fewer than 146. Exactly those lengths remain long enough to parse. A note longer than 4096 bytes is rejected before plaintext is returned, including an authenticated oversized PQ note. Plaintexts of 882 and 878 bytes still encrypt, and those notes stay at most 1024 bytes.
7. A note payment fee is one minimum fee plus the consensus surcharge for bytes past 1024. With a minimum fee of 1000 microAlgos, notes of 1024, 2000, and 4096 bytes cost 1000, 1098, and 1308 microAlgos. This library does not add a Falcon signer.
8. `build_payment` and `sign_payment` produce the transaction id and signed bytes `py-algorand-sdk` produces for the same payment, so algod accepts them unchanged.
9. `AlgoChat.process_transaction` fills `reply_context` from a section 9.2 reply payload (`replyTo.txid` and `replyTo.preview`) and returns the reply's own text as `content`.

## Behavioral Examples

```text
Given two AlgoChat key pairs and an authenticated plaintext
When the sender encrypts and encodes an envelope for the recipient
Then the recipient decodes and decrypts the original plaintext and tampering fails authentication

Given a standard plaintext of 3954 bytes or a PSK plaintext of 3950 bytes
When the sender encrypts and encodes the envelope
Then the note is 4096 bytes, and one extra plaintext byte is rejected before a transaction is built

Given minimum fee 1000 and notes of 1024, 2000, and 4096 bytes
When the payment fee is chosen
Then the fees are 1000, 1098, and 1308 microAlgos
```

## Error Cases

| Error | When | Behavior |
|---|---|---|
| Invalid envelope | Encoded data has an unsupported marker, length, or field layout | Reject decoding without returning unauthenticated plaintext |
| Authentication failure | Ciphertext, associated data, key material, or signature is invalid | Raise the existing protocol error |
| Replay | A PSK receive counter was already processed or is outside the accepted window | Reject the message and preserve valid state |
| Missing key or message | Storage, queue, or transport lookup cannot resolve the requested item | Return or raise the existing explicit absence result |
| Message too large | Plaintext exceeds 3954 bytes (standard) or 3950 bytes (PSK) | Reject before a transaction is built |

## Dependencies

- Python 3.10 or newer
- `cryptography>=50` for ML-KEM-768 seed import, X25519, ChaCha20-Poly1305, HKDF, Ed25519, AES-GCM, and PBKDF2 primitives
- Algorand-compatible transaction and note transport supplied through the existing abstractions

## Change Log

| Version | Date | Changes |
|---|---|---|
| 1 | 2026-07-13 | Initial active contract for the existing Python implementation |
| 2026-07-13 | CHG-0002-add-complete-active-python-algochat-contract-and-enforce-100-percent-lifecycle-c: Add complete active Python AlgoChat contract and enforce 100 percent lifecycle coverage |
| 2026-07-13 | CHG-0003-correct-the-python-algochat-lifecycle-gate-execution-order-after-hosted-trust-va: Correct the Python AlgoChat lifecycle gate execution order after hosted Trust validation |
| 2026-07-13 | CHG-0004-replace-generic-python-algochat-export-descriptions-with-precise-implementation: Replace generic Python AlgoChat export descriptions with precise implementation-backed contracts |
| 2026-07-13 | CHG-0007-correct-python-algochat-contract-rows-fixture-evidence-and-free-text-agent-gui: Correct Python AlgoChat contract rows, fixture evidence, and free-text agent guidance |
| 2026-10-16 | Raise the AlgoChat note ceiling to 4096 bytes. Standard plaintext max is 3954. PSK plaintext max is 3950. Note fees add the consensus surcharge above 1024 bytes on top of one minimum fee. |
| 6 | 2026-10-29 | Library payments and HTTP clients so a bot can send by itself: `build_payment`, `sign_payment`, `send_payment`, `SignedPayment`, `HttpAlgodClient`, `HttpIndexerClient`, `HttpError`. `process_transaction` keeps a reply's context (algochat#44). |
| 7 | 2026-10-29 | `NoteTransaction.intra_round_offset`, read from the indexer, so room messages and records order within a round (algochat#45). |
| 8 | 2026-10-30 | Asset transactions for the bot's Raven identity NFT: `build_asset_create`, `build_asset_config` (signed by `sign_payment`, fees as `py-algorand-sdk` computes them), and the asset reads on `HttpAlgodClient` and `HttpIndexerClient` (algochat#59). |

## Corrected Model and Discovery Contracts

- `DiscoveredKey` stores an X25519 public key and its Ed25519 verification state; it does not store an address or source transaction.
- `SendOptions` configures confirmation and indexer waits, their timeouts, and optional reply context; it does not publish keys.
- `SendResult` stores the transaction identifier and resulting sent `Message`; it does not expose a confirmed-round field.
- `discover_encryption_key` returns the first valid key announcement in indexer result order and does not promise latest-key ordering.
