# AlgoChat Protocol Specification

**Version**: 1.3.0
**Status**: Stable

## 1. Overview

AlgoChat is an end-to-end encrypted messaging protocol that uses the Algorand blockchain as a transport and storage layer. Messages are encrypted client-side using modern cryptographic primitives and transmitted as transaction notes.

## 2. Design Goals

1. **Privacy** - Only sender and recipient can read messages
2. **Per-Message Key Separation** - Each everyday (`0x01`) and Extra lock (`0x02`) message derives its own symmetric key from a fresh ephemeral key pair. A hybrid `0x05` message reuses the session key from its `0x04` handshake. This is not forward secrecy; see [11.1](#111-forward-secrecy--not-provided)
3. **Bidirectional Decryption** - Sender can decrypt their own sent messages. This enables chat history display on the sender's device without storing plaintext locally—messages can be re-decrypted from the blockchain on any authorized device.
4. **Immutability** - Messages cannot be altered after transmission
5. **Decentralization** - No trusted third parties required
6. **Simplicity** - Minimal protocol complexity
7. **Quantum Resistance (Optional)** - Pre-shared key mode provides defense-in-depth against future quantum attacks on key exchange
8. **Account agility** - Payments MAY be authorized by Ed25519 or by native Falcon-1024 (`pqsig`). Envelope bytes do not depend on the authorizing scheme. Falcon identity does not make X25519 key exchange quantum-safe.

## 3. Cryptographic Primitives

| Function | Algorithm | Reference |
|----------|-----------|-----------|
| Key Agreement | X25519 ECDH | RFC 7748 |
| Authenticated Encryption | ChaCha20-Poly1305 | RFC 8439 |
| Key Derivation | HKDF-SHA256 | RFC 5869 |

## 4. Key Derivation

See [TEST-VECTORS.md](./TEST-VECTORS.md#1-key-derivation) for canonical test vectors to verify your implementation.

### 4.1 Encryption Key Pair

Each participant derives an X25519 key pair from the **32-byte entropy** of
their 25-word Algorand mnemonic. That entropy is the IKM. It is independent
of whether payments are later authorized by Ed25519 or Falcon-1024.

```
entropy = 32-byte master seed from the 25-word Algorand mnemonic
salt    = "AlgoChat-v1-encryption"
info    = "x25519-key"

encryption_seed = HKDF-SHA256(entropy, salt, info, 32)
private_key = encryption_seed
public_key  = X25519_PUBLIC(private_key)
```

For an Ed25519 Algorand account, `entropy` is identical to
`algorand_account_private_key[0:32]`. Implementations MUST NOT take the first
32 bytes of a Falcon-1024 secret key as `entropy`. Falcon secret keys are
much larger and are derived from the mnemonic through a domain-separated
hash (`SHA512-256("PQK" || scheme || entropy)`). Using that material as the
AlgoChat IKM would silently fork every encryption key.

The test vectors in [TEST-VECTORS.md](./TEST-VECTORS.md#1-key-derivation)
feed 32-byte seeds. Those seeds are mnemonic entropy. They are unchanged.

### 4.2 Ephemeral Key Pair

Each message uses a fresh ephemeral key pair:

```
ephemeral_private = RANDOM(32)
ephemeral_public = X25519_PUBLIC(ephemeral_private)
```

### 4.3 Algorand account identity

The envelope does not encode the Algorand signature scheme. The payment that
carries the note does.

| Scheme | Transaction field | Address | Create | Import without a scheme |
| --- | --- | --- | --- | --- |
| Ed25519 | `sig` | Encodes the 32-byte Ed25519 public key | Allowed | **Required default.** Recovers the classical address (Pera / AlgoChat v1.1). |
| Falcon-1024 | `pqsig` (`sch = "f1"`) | `SHA512-256("PQA" \|\| "f1" \|\| salt \|\| pk)` encoded as the usual 58-character address | Allowed; implementations MAY default new accounts here | **MUST be explicit.** The same 25 words yield a different address. |

The 25-word mnemonic is a cross-scheme master secret. One mnemonic can derive
both an Ed25519 account and a Falcon-1024 account. They do not share an
address. They DO share AlgoChat encryption keys, because those keys come
from the mnemonic entropy (section 4.1).

An existing Ed25519 account MAY rekey its auth address to a Falcon-1024
address. The public address stays the same. After rekey, every payment from
that address MUST carry a Falcon `pqsig` and MUST pay the Falcon fee
(section 10.3).

## 5. Envelope Format

### 5.1 Wire Format

```
┌─────────────────────────────────────────────────────────────────┐
│ version (1) │ protocol (1) │ sender_pubkey (32) │ ephemeral (32)│
├─────────────────────────────────────────────────────────────────┤
│ nonce (12) │ encrypted_sender_key (48) │ ciphertext (variable) │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Field Definitions

| Field | Size | Description |
|-------|------|-------------|
| version | 1 byte | Envelope version (`0x01` or `0x02`, section 5.4.1) |
| protocol | 1 byte | Protocol identifier (0x01 = AlgoChat) |
| sender_pubkey | 32 bytes | Sender's X25519 public key |
| ephemeral_pubkey | 32 bytes | Per-message ephemeral public key |
| nonce | 12 bytes | Random nonce for ChaCha20-Poly1305 |
| encrypted_sender_key | 48 bytes | Encrypted symmetric key for sender (32 + 16 tag) |
| ciphertext | variable | Encrypted message + 16-byte auth tag |

### 5.3 Size Constraints (Standard Mode)

- **Header size**: 126 bytes (fixed)
- **Algorand note limit**: 4096 bytes
- **Maximum ciphertext**: 3970 bytes (4096 - 126)
- **Maximum plaintext**: 3954 bytes (3970 - 16 auth tag)

A plaintext of 3954 bytes encrypts to a note of exactly 4096 bytes. One byte past that maximum MUST fail before a transaction is built. A note of 4097 bytes is not legal.

A plaintext of 882 bytes still encrypts. That envelope is 1024 bytes. It remains valid and is no longer the maximum.

### 5.4 Protocol Identifiers

| Byte Value | Mode | Status | Description |
|------------|------|--------|-------------|
| `0x01` | Standard | Stable | X25519 ECDH with ephemeral keys |
| `0x02` | Ratcheting PSK | Stable (v1.1) | Hybrid X25519 + ratcheting pre-shared key. Provides defense-in-depth against quantum key exchange attacks. |
| `0x04` | PQ handshake | Stable (v1.3) | One note. X25519 plus ML-KEM-768. Establishes a session key. |
| `0x05` | PQ message | Stable (v1.3) | One note under the `0x04` session key. |

Identifier `0x03` is not assigned.

### 5.4.1 Envelope version

Everyday (`0x01`) and Extra lock (`0x02`) notes use version byte `0x01` or `0x02`. The field layout does not change.

- Version `0x01` uses empty associated data for the payload and for the sender-key wrap.
- Version `0x02` binds the full fixed header as the payload's associated data. That header includes the wrapped sender key, so the wrap is computed first and uses empty associated data.

A reader MUST accept both versions. Changing the version byte of a version `0x02` note MUST fail decryption. Protocols `0x04` and `0x05` use version byte `0x02` with the layouts in section 5.7. That is a different header from an everyday version `0x02` note. The protocol byte tells them apart.

### 5.5 PSK Wire Format (Protocol `0x02`)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ version (1) │ protocol (1) │ ratchet_counter (4) │ sender_pubkey (32)       │
├──────────────────────────────────────────────────────────────────────────────┤
│ ephemeral (32) │ nonce (12) │ encrypted_sender_key (48) │ ciphertext (var)  │
└──────────────────────────────────────────────────────────────────────────────┘
```

| Field | Size | Description |
|-------|------|-------------|
| version | 1 byte | Envelope version (`0x01` or `0x02`, section 5.4.1) |
| protocol | 1 byte | Protocol identifier (`0x02` = Ratcheting PSK) |
| ratchet_counter | 4 bytes | Big-endian message counter for PSK ratcheting |
| sender_pubkey | 32 bytes | Sender's X25519 public key |
| ephemeral_pubkey | 32 bytes | Per-message ephemeral public key |
| nonce | 12 bytes | Random nonce for ChaCha20-Poly1305 |
| encrypted_sender_key | 48 bytes | Encrypted symmetric key for sender (32 + 16 tag) |
| ciphertext | variable | Encrypted message + 16-byte auth tag |

The `ratchet_counter` field is a monotonically increasing 32-bit unsigned integer. It determines which derived PSK is used for the message. The counter starts at 0 for the first message in a PSK conversation and increments by 1 for each subsequent message sent by the same sender.

### 5.6 PSK Size Constraints

- **PSK header size**: 130 bytes (126 + 4 bytes ratchet counter)
- **Algorand note limit**: 4096 bytes
- **Maximum ciphertext**: 3966 bytes (4096 - 130)
- **Maximum plaintext**: 3950 bytes (3966 - 16 auth tag)

A plaintext of 3950 bytes encrypts to a note of exactly 4096 bytes. One byte past that maximum MUST fail before a transaction is built. A note of 4097 bytes is not legal.

A plaintext of 878 bytes still encrypts. That envelope is 1024 bytes. It remains valid and is no longer the maximum.

### 5.7 Hybrid session (protocols `0x04` and `0x05`)

This mode is optional. A peer with no ML-KEM encapsulation key still receives `0x01` or `0x02`. Identifier `0x03` is not assigned.

ML-KEM-768 (FIPS 203, category 3) is combined with X25519. The recipient derives the session key from both shared secrets. The long-term ML-KEM key opens every handshake sent to that account on that path. This is not forward secrecy.

The handshake also carries a sender copy of the session key. That copy is sealed under both of these secrets, which the sender can recompute later:

- X25519 of the sender's long-term key and the ephemeral public key on the note
- ML-KEM-768 decapsulation of a ciphertext on the note addressed to the sender's own encapsulation key

An attacker who breaks only X25519, or only ML-KEM, cannot open that copy. Opening it requires both.

The encapsulation key is derived from the same 32-byte account seed as the X25519 key, with HKDF-SHA256 salt `AlgoChat-v1-mlkem768` and info `mlkem768-d` and `mlkem768-z`. Those 32-byte outputs are concatenated and passed to ML-KEM key generation.

An announcement note is a self-payment:

```
magic "ACPQ" (4) | version 0x01 (1) | encapsulation key (1184) | Ed25519 signature (64, optional)
```

The signature is over SHA-256 of `AlgoChat-pq-ek-v1`, the version byte, and the encapsulation key. A bad signature is rejected. No signature means the key is unverified. Implementations MUST NOT parse an `ACPQ` note as an X25519 announcement.

The handshake is one note of 2366 bytes:

```
version 0x02 | protocol 0x04 | sender X25519 (32) | recipient X25519 (32)
ephemeral X25519 (32) | recipient ML-KEM ciphertext (1088) | SHA-256(recipient encapsulation key) (32)
sender ML-KEM ciphertext (1088) | nonce (12) | wrapped session key (48)
```

The recipient decapsulates the recipient ciphertext and runs X25519, then derives the session key. The recipient does not need the sender ciphertext.

Sender wrap key, HKDF-SHA256, 32 bytes:

```
ikm  = X25519(sender long-term, ephemeral) || sender ML-KEM shared secret
salt = ephemeral public
info = UTF-8 "AlgoChatPQ-SenderKey" || sender X25519
```

When the handshake is built, X25519(ephemeral private, sender public) is the same shared secret. The wrap AEAD is ChaCha20-Poly1305. Its associated data is every handshake byte before the wrapped key (2318 bytes). The nonce is the 12-byte field in the handshake.

A `0x05` message uses the 78-byte header as associated data. The payload ciphertext starts at byte 78.

Session key, HKDF-SHA256, 32 bytes:

```
salt = UTF-8 "algochat-pq-v1"
ikm  = X25519 shared secret || ML-KEM shared secret
info = UTF-8 "algochat-pq-v1" || ephemeral public || ML-KEM ciphertext
       || sender X25519 || recipient X25519 || SHA-256(encapsulation key)
```

A `0x05` message header is 78 bytes:

```
version 0x02 | protocol 0x05 | sender X25519 (32) | SHA-256(handshake note) (32) | nonce (12)
```

The ciphertext and 16-byte tag follow. Maximum plaintext is 4002 bytes (4096 - 78 - 16). A 3-byte message is a 97-byte note. The handshake is paid once. Later messages stay under 1024 bytes unless the plaintext itself is long.

## 6. Encryption

### 6.1 Message Encryption (Sender → Recipient)

```
// Generate ephemeral key pair
ephemeral_private, ephemeral_public = GENERATE_KEYPAIR()

// Derive shared secret with recipient
shared_secret = X25519(ephemeral_private, recipient_public_key)

// Derive symmetric key
info = "AlgoChatV1" || sender_public_key || recipient_public_key
symmetric_key = HKDF-SHA256(shared_secret, ephemeral_public, info, 32)

// Encrypt message
nonce = RANDOM(12)
ciphertext = ChaCha20-Poly1305-ENCRYPT(symmetric_key, nonce, plaintext)
```

### 6.2 Sender Key Encryption (Self-Decryption)

To allow the sender to decrypt their own messages:

```
// Derive shared secret with self
sender_shared_secret = X25519(ephemeral_private, sender_public_key)

// Derive sender encryption key
sender_info = "AlgoChatV1-SenderKey" || sender_public_key
sender_encryption_key = HKDF-SHA256(sender_shared_secret, ephemeral_public, sender_info, 32)

// Encrypt the symmetric key
encrypted_sender_key = ChaCha20-Poly1305-ENCRYPT(sender_encryption_key, nonce, symmetric_key)
```

## 7. Decryption

### 7.1 Recipient Decryption

```
// Derive shared secret
shared_secret = X25519(recipient_private_key, ephemeral_public_key)

// Derive symmetric key
info = "AlgoChatV1" || sender_public_key || recipient_public_key
symmetric_key = HKDF-SHA256(shared_secret, ephemeral_public_key, info, 32)

// Decrypt message
plaintext = ChaCha20-Poly1305-DECRYPT(symmetric_key, nonce, ciphertext)
```

### 7.2 Sender Decryption (Own Messages)

```
// Derive shared secret with self
sender_shared_secret = X25519(sender_private_key, ephemeral_public_key)

// Derive sender decryption key
sender_info = "AlgoChatV1-SenderKey" || sender_public_key
sender_decryption_key = HKDF-SHA256(sender_shared_secret, ephemeral_public_key, sender_info, 32)

// Decrypt the symmetric key
symmetric_key = ChaCha20-Poly1305-DECRYPT(sender_decryption_key, nonce, encrypted_sender_key)

// Decrypt message
plaintext = ChaCha20-Poly1305-DECRYPT(symmetric_key, nonce, ciphertext)
```

## 8. PSK Ratcheting Mode (Protocol `0x02`)

This section defines the ratcheting pre-shared key mode. All standard mode (sections 6-7) content remains unchanged. PSK mode is entirely additive.

### 8.1 PSK Ratchet Mechanism

PSK ratcheting uses a deterministic, session-based derivation scheme. Given an `initial_psk` shared between two parties and a `ratchet_counter`, the current PSK is derived in two stages:

**Stage 1: Session PSK**

Messages are grouped into sessions of `PSK_SESSION_SIZE` (100) messages. The session PSK is derived from the initial PSK and the session index:

```
session_index = floor(ratchet_counter / PSK_SESSION_SIZE)

session_psk = HKDF-SHA256(
    ikm:  initial_psk,
    salt: "AlgoChat-PSK-Session",
    info: session_index as 4-byte big-endian,
    length: 32
)
```

**Stage 2: Position PSK**

Within a session, each message position derives a unique PSK:

```
position = ratchet_counter mod PSK_SESSION_SIZE

position_psk = HKDF-SHA256(
    ikm:  session_psk,
    salt: "AlgoChat-PSK-Position",
    info: position as 4-byte big-endian,
    length: 32
)
```

The `position_psk` is the PSK used for the message at this counter value.

**Properties:**
- Any counter value can be derived independently (no sequential dependency)
- The `initial_psk` is never used directly for encryption
- Compromising a `session_psk` exposes at most 100 messages in that session
- Compromising a `position_psk` exposes only one message

> **Naming note.** "Ratchet" here denotes a deterministic key *schedule*, not a
> ratchet in the Signal/Double-Ratchet sense. Because any counter value can be
> derived independently from `initial_psk`, holding the initial PSK yields every
> past and future position key. Nothing is advanced-and-destroyed, so this
> construction does not provide forward secrecy. The wire field name
> `ratchet_counter` is retained for compatibility.

### 8.2 PSK Key Derivation

PSK mode uses a hybrid key derivation that mixes both the X25519 shared secret and the ratcheted PSK into the symmetric key. This ensures that an attacker must break **both** X25519 and know the PSK to decrypt messages.

**Recipient Symmetric Key (PSK Mode):**

```
// Standard ECDH shared secret
shared_secret = X25519(ephemeral_private, recipient_public_key)

// Derive ratcheted PSK for this counter value
current_psk = derive_position_psk(initial_psk, ratchet_counter)

// Hybrid key derivation: mix ECDH + PSK
info = "AlgoChatV1-PSK" || sender_public_key || recipient_public_key
psk_symmetric_key = HKDF-SHA256(
    ikm:  shared_secret || current_psk,
    salt: ephemeral_public_key,
    info: info,
    length: 32
)
```

**Sender Key (PSK Mode):**

```
sender_shared_secret = X25519(ephemeral_private, sender_public_key)

sender_info = "AlgoChatV1-PSK-SenderKey" || sender_public_key
psk_sender_key = HKDF-SHA256(
    ikm:  sender_shared_secret || current_psk,
    salt: ephemeral_public_key,
    info: sender_info,
    length: 32
)
```

### 8.3 PSK Encryption

```
// Generate ephemeral key pair
ephemeral_private, ephemeral_public = GENERATE_KEYPAIR()

// Derive ratcheted PSK
current_psk = derive_position_psk(initial_psk, ratchet_counter)

// Derive PSK symmetric key (hybrid ECDH + PSK)
shared_secret = X25519(ephemeral_private, recipient_public_key)
info = "AlgoChatV1-PSK" || sender_public_key || recipient_public_key
psk_symmetric_key = HKDF-SHA256(
    ikm:  shared_secret || current_psk,
    salt: ephemeral_public,
    info: info,
    length: 32
)

// Encrypt message
nonce = RANDOM(12)
ciphertext = ChaCha20-Poly1305-ENCRYPT(psk_symmetric_key, nonce, plaintext)

// Encrypt symmetric key for sender
sender_shared_secret = X25519(ephemeral_private, sender_public_key)
sender_info = "AlgoChatV1-PSK-SenderKey" || sender_public_key
psk_sender_key = HKDF-SHA256(
    ikm:  sender_shared_secret || current_psk,
    salt: ephemeral_public,
    info: sender_info,
    length: 32
)
encrypted_sender_key = ChaCha20-Poly1305-ENCRYPT(psk_sender_key, nonce, psk_symmetric_key)

// Increment ratchet counter for next message
ratchet_counter += 1
```

### 8.4 PSK Decryption

**Recipient:**

```
// Extract ratchet_counter from envelope
ratchet_counter = envelope.ratchet_counter

// Reject replays (see section 8.5 for full counter validation rules)
if has_seen_counter(sender, ratchet_counter):
    reject("Replay detected")

// Validate counter is within acceptable window
if peer_last_counter > COUNTER_WINDOW and ratchet_counter < peer_last_counter - COUNTER_WINDOW:
    reject("Counter too old")
if ratchet_counter > peer_last_counter + COUNTER_WINDOW:
    reject("Counter too far ahead")

// Derive ratcheted PSK
current_psk = derive_position_psk(initial_psk, ratchet_counter)

// Derive PSK symmetric key
shared_secret = X25519(recipient_private_key, envelope.ephemeral_public_key)
info = "AlgoChatV1-PSK" || envelope.sender_public_key || recipient_public_key
psk_symmetric_key = HKDF-SHA256(
    ikm:  shared_secret || current_psk,
    salt: envelope.ephemeral_public_key,
    info: info,
    length: 32
)

// Decrypt message
plaintext = ChaCha20-Poly1305-DECRYPT(psk_symmetric_key, nonce, ciphertext)

// Update counter tracking
update_peer_counter(envelope.sender_public_key, ratchet_counter)
```

**Sender (Own Messages):**

```
ratchet_counter = envelope.ratchet_counter
current_psk = derive_position_psk(initial_psk, ratchet_counter)

sender_shared_secret = X25519(sender_private_key, envelope.ephemeral_public_key)
sender_info = "AlgoChatV1-PSK-SenderKey" || sender_public_key
psk_sender_key = HKDF-SHA256(
    ikm:  sender_shared_secret || current_psk,
    salt: envelope.ephemeral_public_key,
    info: sender_info,
    length: 32
)

symmetric_key = ChaCha20-Poly1305-DECRYPT(psk_sender_key, nonce, encrypted_sender_key)
plaintext = ChaCha20-Poly1305-DECRYPT(symmetric_key, nonce, ciphertext)
```

### 8.5 Counter Window

Implementations MUST maintain a counter window to handle out-of-order message delivery on the blockchain. The recommended window size is `COUNTER_WINDOW = 200` (2 full sessions).

Counter validation rules:
1. A counter value that has already been successfully decrypted MUST be rejected (replay protection)
2. A counter value more than `COUNTER_WINDOW` behind the highest seen counter SHOULD be rejected
3. A counter value more than `COUNTER_WINDOW` ahead of the highest seen counter SHOULD be rejected (potential attack or state desynchronization)
4. Within the window, any unseen counter value MUST be accepted regardless of order

### 8.6 PSK Exchange

The initial PSK is exchanged out-of-band between participants. The recommended format for exchange is a URI:

```
algochat-psk://v1?addr=<algorand-address>&psk=<base64url-psk>&label=<display-name>
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `addr` | Yes | Algorand address of the PSK owner |
| `psk` | Yes | 32-byte PSK, base64url-encoded (no padding) |
| `label` | No | Human-readable display name |

**Example:**

```
algochat-psk://v1?addr=ABC123...XYZ&psk=qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq&label=Alice
```

The PSK MUST be generated using a cryptographically secure random number generator (CSPRNG). Both parties must store the same `initial_psk` for their shared conversation. The exchange SHOULD occur in-person or over an authenticated, confidential channel.

## 9. Message Payload

### 9.1 Text Message

```json
{
    "text": "Hello, world!"
}
```

### 9.2 Reply Message

```json
{
    "text": "This is a reply",
    "replyTo": {
        "txid": "ABC123...",
        "preview": "Original message preview..."
    }
}
```

### 9.3 Key Publish

Used to publish encryption public key for key discovery:

```json
{
    "type": "key-publish",
    "publicKey": "<base64-encoded-public-key>"
}
```

## 10. Transport Layer

### 10.1 Algorand Transaction

Messages are sent as payment transactions:

```
{
    "type": "pay",
    "sender": "<sender-algorand-address>",
    "receiver": "<recipient-algorand-address>",
    "amount": 0,
    "note": "<encrypted-envelope-bytes>"
}
```

### 10.2 Key Discovery

To message someone, you need their X25519 public key. Discovery methods:

1. **Transaction History** - Scan recipient's sent transactions for `sender_pubkey` in envelopes
2. **Key Publish Transaction** - Look for key-publish messages sent to self
3. **Out-of-Band** - Exchange keys through another channel

The binding between Algorand identity and that X25519 key is the
**authorizing signature of the payment** (`sig` or `pqsig`). A peer who can
spend from the sender address published the envelope. Implementations MAY
also attach an Ed25519 signature over the X25519 public key (the v1.1
announce format). That extra signature is optional, applies only when the
sender address is an Ed25519 public key, and MUST NOT be required for
Falcon-1024 senders.

### 10.3 Fees

AlgoChat does not set the network fee. It inherits Algorand's minimum for the authorizing scheme, plus a surcharge once the note grows past 1024 bytes.

The scheme minimum covers the first 1024 note bytes. For a note that is allowed:

```
over           = max(0, noteBytes - 1024)
surcharge      = ceil((over * minFee) / 10000)   # integer; 0 when over is 0
schemeMinimum  = minFee * 3 when Falcon-1024, else minFee
fee            = schemeMinimum + surcharge
```

The same surcharge, using integer division on these non-negative values:

```
surcharge = (over * minFee + 9999) / 10000
```

A note of 1024 bytes or fewer pays only the scheme minimum. A note of 4097 bytes is not a legal note.

Confirmed examples at minFee = 1000 µAlgo:

| Note bytes | Authorizing scheme | Fee |
| --- | --- | --- |
| 1024 | Ed25519 | 1,000 µAlgo |
| 1024 | Falcon-1024 | 3,000 µAlgo |
| 2000 | Ed25519 | 1,098 µAlgo |
| 4096 | Ed25519 | 1,308 µAlgo |
| 4096 | Falcon-1024 | 3,308 µAlgo |

Implementations MUST set the fee to at least `schemeMinimum + surcharge` (or the value reported by simulate with a placeholder `pqsig` when the scheme is Falcon). Underpaying is rejected by consensus. The payment `amount` field (often 0 or 1,000 µAlgo) is independent of this fee.

**Filtering for AlgoChat transactions:**

When querying the indexer, filter by note prefix to match the protocol mode:

| Mode | Note Prefix | Description |
|------|-------------|-------------|
| Standard, version `0x01` | `0x0101` | Empty associated data |
| Standard, version `0x02` | `0x0201` | Full header is payload associated data |
| Extra lock, version `0x01` | `0x0102` | Empty associated data |
| Extra lock, version `0x02` | `0x0202` | Full header is payload associated data |

To discover everyday and Extra lock notes, query for all four prefixes:

```
standardV1 = [0x01, 0x01]
standardV2 = [0x02, 0x01]
pskV1      = [0x01, 0x02]
pskV2      = [0x02, 0x02]
```

See [IMPLEMENTATION.md](./IMPLEMENTATION.md) for pseudocode examples.

## 11. Security Considerations

### 11.1 Forward Secrecy — Not Provided

**AlgoChat does not provide forward secrecy.** Every message uses a fresh ephemeral
key pair, which separates per-message symmetric keys, but that ephemeral key belongs
to the *sender* and its public half travels in the envelope. Recovering a message key
requires only a long-term private key and that public value:

```
shared_secret = X25519(recipient_private_key, envelope.ephemeral_public_key)
```

The envelope is stored permanently and publicly on the Algorand blockchain. An
attacker who obtains either party's long-term private key — or the recovery phrase
that derives it — can therefore retroactively decrypt **every base-mode message that account
has ever sent or received** (PSK-mode decryption additionally requires the PSK), and no revocation or key rotation can undo this,
because the ciphertext remains publicly retrievable forever.

This applies to both modes. In PSK mode (`0x02`) the pre-shared key is mixed into
HKDF alongside the ECDH secret, so an attacker needs the PSK *as well as* a
long-term key — a meaningful additional barrier, but not forward secrecy: the PSK
is static, and every position key is a deterministic function of it (see
[8.1](#81-psk-ratchet-mechanism)).

No key material is ever ratcheted forward and destroyed. Achieving forward secrecy
would require a scheme such as the Double Ratchet, in which past keys become
unrecoverable after use.

**Implication for users:** a recovery phrase exposes the complete, permanent base-mode
message history of that account; PSK-mode history additionally requires the PSK. It must be protected accordingly.

### 11.2 Replay Protection

The blockchain provides replay protection through transaction uniqueness. PSK mode adds counter-based replay protection within the ratchet window.

### 11.3 Metadata Leakage

The following metadata is visible on-chain:
- Sender Algorand address
- Recipient Algorand address
- Timestamp (block time)
- Message size (approximate)
- Protocol mode (`0x01` vs `0x02`) reveals whether PSK is in use

### 11.4 Key Compromise

If a recipient's private key is compromised:
- **All past messages to that key are compromised.** Envelopes stay publicly
  retrievable from the chain indefinitely, so the exposure is retroactive and
  permanent (see [11.1](#111-forward-secrecy--not-provided))
- Future messages to that key are compromised
- The sender's own decryptable copies use a separate derivation, so they are *not*
  exposed by the recipient's key — but they are exposed in exactly the same
  retroactive way by compromise of the **sender's** key
- **With PSK mode**: decryption additionally requires the initial PSK. This raises
  the bar against an attacker holding only one secret, but does not restore forward
  secrecy — an attacker holding both the PSK and a long-term key recovers the full
  history

Because compromise is retroactive and irreversible, key rotation limits future
exposure only. There is no mechanism to protect already-published ciphertext.

## 12. Constants

```
// Standard mode
PROTOCOL_VERSION       = 0x01
PROTOCOL_STANDARD      = 0x01
HEADER_SIZE            = 126
MAX_PAYLOAD_SIZE       = 3954

// PSK ratcheting mode
PROTOCOL_PSK_RATCHET   = 0x02
PSK_HEADER_SIZE        = 130
PSK_MAX_PAYLOAD_SIZE   = 3950
PSK_SESSION_SIZE       = 100
COUNTER_WINDOW         = 200

// Shared
MAX_NOTE_SIZE          = 4096
FALCON_FEE_MULTIPLIER  = 3   // Falcon-1024 min fee = minFee * 3
// Note surcharge (integer): ceil((max(0, noteBytes - 1024) * minFee) / 10000), added to the scheme minimum.

// Key derivation constants
KEY_DERIVATION_SALT        = "AlgoChat-v1-encryption"
KEY_DERIVATION_INFO        = "x25519-key"
ENCRYPTION_INFO_PREFIX     = "AlgoChatV1"
SENDER_KEY_INFO_PREFIX     = "AlgoChatV1-SenderKey"

// PSK derivation constants
PSK_SESSION_SALT           = "AlgoChat-PSK-Session"
PSK_POSITION_SALT          = "AlgoChat-PSK-Position"
PSK_ENCRYPTION_INFO_PREFIX = "AlgoChatV1-PSK"
PSK_SENDER_KEY_INFO_PREFIX = "AlgoChatV1-PSK-SenderKey"
```

## 13. Test Vectors

See [TEST-VECTORS.md](./TEST-VECTORS.md) for canonical test vectors that enable cross-implementation verification.

## 14. Version History

| Version | Changes |
|---------|---------|
| 1.0 | Initial specification |
| 1.1 | Add ratcheting PSK mode (protocol `0x02`). |
| 1.2 | Account agility: payments MAY be Falcon-1024 `pqsig` as well as Ed25519 `sig`. Encryption seed is mnemonic entropy, not a signing-key prefix. Falcon min fee is 3×. Envelope bytes and 1.1 test vectors are unchanged. |
| 1.2.1 | Capacity and fee change, not a new envelope. Same envelopes as 1.2. Note limit is 4096 bytes (standard plaintext 3954, PSK plaintext 3950). The scheme minimum covers the first 1024 note bytes; further bytes add the surcharge in section 10.3. |
| 1.3.0 | Optional hybrid session. Protocol `0x04` is one handshake note. Protocol `0x05` is a message under that session key. Everyday and Extra lock also accept envelope version `0x02`, which binds the full header as payload associated data. Version `0x01` stays valid. `0x03` is not assigned. |
