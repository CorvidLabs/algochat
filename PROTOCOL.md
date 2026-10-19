# AlgoChat Protocol Specification

**Version**: 1.4.0
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
| Optional Hybrid Key Encapsulation | ML-KEM-768, combined with X25519 | FIPS 203 |
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

Each standard (`0x01`) or PSK (`0x02`) message uses a fresh ephemeral key pair. A hybrid handshake (`0x04`) also creates one; subsequent `0x05` messages reuse its session key:

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
| `0x03` | Room administration | Implemented | Public room record: owner, admins, members, joining rule, and name. Included in tag v1.4.0. Not in tag v1.3.0. |
| `0x06` | Group membership | Implemented | One hybrid-session note that delivers a group key to one member. Included in tag v1.4.0. Not in tag v1.3.0. |
| `0x07` | Group message | Implemented | One note on the group mailbox under the current group key. Included in tag v1.4.0. Not in tag v1.3.0. |

`0x03`, `0x06`, and `0x07` are specified in section 5.8. Section 5.8.4 records the earlier LocalNet run, which did not use `0x03`. Tag v1.4.0 includes these ids. Tag v1.3.0 does not.

### 5.4.1 Envelope version

Everyday (`0x01`) and Extra lock (`0x02`) notes use version byte `0x01` or `0x02`. The field layout does not change.

- Version `0x01` uses empty associated data for the payload and for the sender-key wrap.
- Version `0x02` binds the full fixed header as the payload's associated data. That header includes the wrapped sender key, so the wrap is computed first and uses empty associated data.

A reader MUST accept both versions. Changing the version byte of a version `0x02` note MUST fail decryption. Protocols `0x04` and `0x05` use version byte `0x02` with the layouts in section 5.7. That is a different header from an everyday version `0x02` note. The protocol byte tells them apart.

### 5.4.2 PQ levels

PQ level is an integer from 0 to 5. Other documents in this repository MUST use these numbers and MUST NOT invent a second scale. Levels 1 through 5 are the NIST post-quantum security categories: 1 matches AES-128 key search, 2 matches SHA-256 collision search, 3 matches AES-192 key search, 4 matches SHA-384 collision search, and 5 matches AES-256 key search. Level 0 means a quantum computer breaks the key exchange with Shor's algorithm and no category 1 through 5 primitive is required. Every mode uses ChaCha20-Poly1305 with a 256-bit key for the message body. That symmetric layer is category 1 under Grover's algorithm and is the same for all of them. The level in the table is the key exchange. None of these modes provide forward secrecy. See section 11.1.

| PQ level | NIST meaning | Used by |
| --- | --- | --- |
| 0 | No PQC primitive. Shor breaks the key exchange. | Everyday `0x01` |
| 1 | Category 1. At least as hard as AES-128 key search. | Extra lock `0x02`, only while the 32-byte pre-shared key stays secret |
| 2 | Category 2. At least as hard as SHA-256 collision search. | No assigned protocol |
| 3 | Category 3. At least as hard as AES-192 key search. | Hybrid handshake `0x04`, hybrid message `0x05`, group membership `0x06`, and group message `0x07` |
| 4 | Category 4. At least as hard as SHA-384 collision search. | No assigned protocol |
| 5 | Category 5. At least as hard as AES-256 key search. | No message protocol. A Falcon-1024 account signature is category 5 for payment authorization only and does not raise the note. |

| Protocol | Name | PQ level |
| --- | --- | --- |
| `0x01` | Everyday | 0. X25519 only. |
| `0x02` | Extra lock | 1 while the 32-byte pre-shared key stays secret. A lost or low-entropy secret drops the note to level 0. |
| `0x03` | Room administration | No key exchange. The record is public and has no PQ level. The room key stays in `0x06`, which is level 3. |
| `0x04` | Hybrid handshake | 3. ML-KEM-768 is FIPS 203 category 3, and the session key also requires the X25519 shared secret. Breaking only one does not open the handshake. Both long-term keys together do. |
| `0x05` | Hybrid message | 3, the same as its `0x04` handshake. The session key opens every `0x05` note in that handshake. A leaked session key opens those notes without a new attack on ML-KEM. |
| `0x06` | Group membership | 3. The group key is wrapped under the hybrid session. Both the X25519 shared secret and the ML-KEM-768 shared secret are required. |
| `0x07` | Group message | 3, the same as the `0x06` wrap that delivered the group key. A leaked group key opens every `0x07` note in that epoch. |

Group membership `0x06` and group message `0x07` are assigned in section 5.8. The wrap is the hybrid session, so it is PQ level 3. Level 0 does not meet the bar. This version does not define an Extra lock wrap for the group key. The group message uses the same ChaCha20-Poly1305 body as the other modes. Room administration `0x03` carries no key, so it has no PQ level.

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

This mode is optional. Applications select it explicitly, discover and bind both peers' keys, transport the handshake, and retain or recover the session. The high-level conversation clients do not automatically negotiate it. A peer with no ML-KEM encapsulation key can receive `0x01` or `0x02` under the application's mode policy; absence of a key is not permission to silently downgrade an explicitly required hybrid exchange. See the [implementation boundaries and diagrams](docs/PROTOCOL-FLOWS.md).

ML-KEM-768 ([FIPS 203](https://csrc.nist.gov/pubs/fips/203/final), finalized August 2024, category 3) is combined with X25519. Using this standardized algorithm does not establish an implementation audit or FIPS validation. The recipient derives the session key from both shared secrets. The long-term ML-KEM key decapsulates the ML-KEM half of every handshake sent to that account; recovering the session also requires the recipient's X25519 secret. This is not forward secrecy.

The handshake also carries a sender copy of the session key. That copy is sealed under both of these secrets, which the sender can recompute later:

- X25519 of the sender's long-term key and the ephemeral public key on the note
- ML-KEM-768 decapsulation of a ciphertext on the note addressed to the sender's own encapsulation key

An attacker who breaks only X25519, or only ML-KEM, cannot open that copy. Opening it requires both.

The encapsulation key is derived from the same 32-byte account seed as the X25519 key, with HKDF-SHA256 salt `AlgoChat-v1-mlkem768` and info `mlkem768-d` and `mlkem768-z`. Those 32-byte outputs are concatenated and passed to ML-KEM key generation.

An announcement note is a self-payment:

```
magic "ACPQ" (4) | version 0x01 (1) | encapsulation key (1184) | Ed25519 signature (64, optional)
```

The unsigned announcement is 1189 bytes; the signed form is 1253 bytes. Its version is an announcement version, not an envelope version. The signature is over SHA-256 of `AlgoChat-pq-ek-v1`, the version byte, and the encapsulation key. A bad signature is rejected. No signature means the key is unverified. Implementations MUST NOT parse an `ACPQ` note as an X25519 announcement.

The handshake is one note of 2366 bytes:

```
version 0x02 | protocol 0x04 | sender X25519 (32) | recipient X25519 (32)
ephemeral X25519 (32) | recipient ML-KEM ciphertext (1088) | SHA-256(recipient encapsulation key) (32)
sender ML-KEM ciphertext (1088) | nonce (12) | wrapped session key (48)
```

All offsets below are zero-based byte offsets; ranges exclude their end. Public keys and transaction ids are raw bytes, not textual addresses or base64. Integer fields below are unsigned and big-endian.

| `0x04` field | Offset | Bytes |
| --- | ---: | ---: |
| Version `0x02`, protocol `0x04` | 0, 1 | 1 each |
| Sender X25519 | 2 | 32 |
| Recipient X25519 | 34 | 32 |
| Ephemeral X25519 | 66 | 32 |
| Recipient ML-KEM ciphertext | 98 | 1088 |
| SHA-256 of recipient encapsulation key | 1186 | 32 |
| Sender ML-KEM ciphertext | 1218 | 1088 |
| Nonce | 2306 | 12 |
| Wrapped session key, including 16-byte tag | 2318 | 48 |

The recipient checks its X25519 key and encapsulation-key hash, decapsulates the recipient ciphertext and runs X25519, then derives the session key. The recipient does not open the sender wrap or need the sender ciphertext to derive that key. The sender recovery path authenticates the 2318-byte prefix when opening the wrap. Recipient derivation alone is not authentication of the claimed sender: retain the authenticated payment sender and its encryption-key binding (section 10.2). The handshake id is SHA-256 of the **entire 2366-byte note**, including the sender wrap.

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

| `0x05` field | Offset | Bytes |
| --- | ---: | ---: |
| Version `0x02`, protocol `0x05` | 0, 1 | 1 each |
| Sender X25519 | 2 | 32 |
| SHA-256 of entire handshake note | 34 | 32 |
| Nonce | 66 | 12 |
| Ciphertext and tag | 78 | plaintext length + 16 |

The full header `note[0:78]` is AAD. Openers bind the sender key and handshake id to the supplied session before authenticating. The ciphertext and 16-byte tag follow. Maximum plaintext is 4002 bytes (4096 - 78 - 16); an empty body is a 94-byte note and a 3-byte body is 97 bytes. Applications MUST enforce the note ceiling on untrusted input; see [the implementation differences](docs/PROTOCOL-FLOWS.md#implementation-boundaries) before relying on a standalone decoder.

Subsequent messages reuse this session key, with a fresh nonce for each seal; the wire format defines no expiry, ratchet, counter or persistent replay cache for `0x05`. Nonces MUST NOT repeat under the same key, including across `0x05` messages and `0x06` deliveries sharing that session. AAD distinguishes their protocols but does not make nonce reuse safe. The handshake is paid once. Later messages stay under 1024 bytes unless the plaintext itself is long.

### 5.8 Group mailbox (protocols `0x03`, `0x06`, and `0x07`)

A group has one mailbox. The mailbox is an Algorand address that is not a member, not an admin, and not the owner. The creator pays 100000 microAlgos to that address once so the account exists. Later administration records and messages are 0 microAlgo payments to that address. The sender pays the fee from their own account. Readers watch payments whose receiver is the mailbox. The mailbox spending key is not required to read or to post, and holding it does not make that person the owner. Signing a payment does not by itself grant a role.

The room key is 32 bytes. It is never written in a `0x03` record. It is delivered only inside `0x06`. An everyday `0x01` wrap is not a legal way to deliver a room key. Creating a room does not mint or require an NFT.

#### 5.8.1 Legacy membership (`0x06` actions 1–4)

A legacy `0x06` note is a 1:1 payment to one member. It uses the hybrid session established by `0x04`. The header is the 78-byte `0x05` header with the protocol byte set to `0x06`:

```
version 0x02 | protocol 0x06 | sender X25519 (32) | SHA-256(handshake note) (32) | nonce (12)
```

Associated data is that header. The key is the hybrid session key. Actions 1 through 4 use a 101-byte plaintext, and the note is 195 bytes:

```
action (1) | epoch (4, big-endian) | group id (32) | mailbox (32) | group key (32)
```

The header offsets are the `0x05` offsets above with protocol `0x06`. In the decrypted plaintext, action is at offset 0, epoch at 1 (4 bytes), group id at 5 (32), mailbox at 37 (32), and group key at 69 (32). The note is `78 + 101 + 16 = 195` bytes. Openers require the session sender and handshake id to match the header.

`action` is 1 for create, 2 for add, 3 for remove, and 4 for rekey. In a legacy note, `epoch` starts at 1 for create and increases by 1 for each later add, remove, or rekey. `group id` is 32 bytes chosen by the creator. `mailbox` is the 32-byte public key of the mailbox address. The low-level codec validates the action and positive epoch; it does not maintain a roster or enforce the sequence of epoch increments. These notes still open. They do not create an owner, and they do not authorize a later administration record. A room that wants an owner, admins, or a joining rule starts a new `0x03` chain. This wrap is PQ level 3: both the X25519 shared secret and the ML-KEM-768 shared secret were required to open the hybrid session.

#### 5.8.2 Room administration (`0x03`)

A `0x03` record is public. It is a 0-microAlgo payment to the room mailbox. The transaction sender is the actor. The note has no separate actor field.

```
version 0x02 | protocol 0x03
parent (32) | group id (32) | mailbox (32) | epoch (4, big-endian) | op (1)
name length (1, 0 through 64) | name (UTF-8)
policy (1) | owner (32)
admin count (2, big-endian) | admins (32 each)
member count (2, big-endian) | members (32 each)
subject (32)
```

For name byte length `N`, admin count `A`, and member count `M`, the exact offsets are:

| `0x03` field | Offset | Bytes |
| --- | ---: | ---: |
| Version `0x02`, protocol `0x03` | 0, 1 | 1 each |
| Parent transaction id | 2 | 32 |
| Group id | 34 | 32 |
| Mailbox account public key | 66 | 32 |
| Epoch | 98 | 4 |
| Operation | 102 | 1 |
| Name byte length `N` | 103 | 1 |
| UTF-8 name | 104 | N |
| Policy | 104 + N | 1 |
| Owner account public key | 105 + N | 32 |
| Admin count `A` | 137 + N | 2 |
| Admin account public keys | 139 + N | 32 × A |
| Member count `M` | 139 + N + 32 × A | 2 |
| Member account public keys | 141 + N + 32 × A | 32 × M |
| Subject account public key | 141 + N + 32 × (A + M) | 32 |

Total length is `173 + N + 32 × (A + M)`. A minimal valid create with one member and an empty name is 205 bytes. There is no AEAD, nonce, tag or key in this public record. Its authority comes from the transaction context and reducer, not successful binary decoding.

`policy` is 1 for invite-only and 2 for ask-to-join. Admin and member lists are strictly increasing 32-byte public keys, with no duplicates. At most 16 admins and 100 members. The display name is at most 64 UTF-8 bytes. The whole note is at most 4096 bytes. Pending join requests are not stored in the note. Clients derive them.

| Op | Name | Who may send it | Effect |
| --- | --- | --- | --- |
| 1 | create | the new owner | Epoch 1, no admins, members are the sender alone, parent and subject are 32 zero bytes. |
| 2 | set name | owner or admin | Replaces the display name. Subject is 32 zero bytes. |
| 3 | set policy | owner or admin | Sets invite-only or ask-to-join. Subject is 32 zero bytes. |
| 4 | appoint admin | owner | Subject is a member, not the owner, and not already an admin. |
| 5 | dismiss admin | owner | Subject is an admin. |
| 6 | transfer owner | owner | Subject is a different member. That person becomes owner and leaves the admin list. The previous owner stays a member. Epoch increases by 1. |
| 7 | add member | owner or admin | Subject is not a member and is not the mailbox. Legal under both joining rules. Epoch stays. |
| 8 | request join | the subject | Ask-to-join only. Subject is the sender, not a member, and not already pending. |
| 9 | accept join | owner or admin | Subject has a pending request and becomes a member. Epoch stays. |
| 10 | decline join | owner or admin | Subject has a pending request. The request is dropped. |
| 11 | remove member | owner or admin | Subject is a member and is not the owner. Epoch increases by 1. |
| 12 | rekey | owner or admin | Subject is 32 zero bytes. Epoch increases by 1. |

Admins must be members other than the owner. The mailbox must not appear as owner, admin or member. The owner cannot be removed. The owner must remain a member. Epoch starts at 1 and increases only for remove, rekey, and transfer. An increment past 4294967295 fails.

The parent of create is 32 zero bytes. Every op except a join request names the transaction id of the current head. Clients accept a record only when the parent state authorized that sender to make that change, and only when the note's owner, epoch, policy, name, admins, and members equal the one next state that change produces. Applying the same transaction id twice is a replay.

Chain order is confirmed round, then intra-round offset, then the transaction id bytes. When two records name the same parent, the earlier one in that order wins. The other stays rejected, even when an admin signed it. Clients recompute from the full set.

A join request does not become the head, so other requests can name the same accepted record. The request must cite an already-accepted **head-advancing** administration transaction of this room, not another request or the all-zero create parent. It is checked against the current roster, name, policy, owner, and epoch, and the note repeats those fields. A request that confirms after a change to those fields is rejected, and the person asks again. A request is legal only while the room is ask-to-join.

Direct add is an invite. It is legal on both joining rules. Request, accept, and decline are the ask-to-join path. A person may belong to more than one room. Membership in one room does not add them to another.

#### 5.8.3 Key delivery (`0x06` action 5) and mailbox messages (`0x07`)

An administered room delivers the room key with `0x06` action 5. The header is the same 78-byte hybrid header. The plaintext is 133 bytes, and the note is 227 bytes:

```
action 5 (1) | epoch (4, big-endian) | group id (32) | mailbox (32) | group key (32) | administration transaction id (32)
```

The decrypted offsets are the legacy membership offsets through byte 100, with action `5` at offset 0 and the 32-byte administration transaction id at offset 101. The note is `78 + 133 + 16 = 227` bytes. Route it to the action-5 delivery opener: the legacy membership recognizers deliberately recognize only 195-byte notes.

Cryptographic opening validates framing, version, protocol, session sender, handshake id, tag, action and positive epoch. It does **not** apply room authorization. The caller must compare the returned group id and mailbox with the intended room and separately call the delivery-authorization helper with that room's accepted records and authenticated transaction sender/recipient.

The cited administration transaction must be an accepted record sent by this same sender. The epoch must match that record. The recipient must be a member after that record. Add and accept authorize delivery only to the subject. Remove authorizes delivery to every remaining member except the subject. Rekey and transfer authorize delivery to every remaining member, including the new owner after a transfer. Create does not authorize a delivery, because the creator generated the key locally. Set name, set policy, appoint, dismiss, request, and decline do not authorize a delivery.

Adding a member sends the current key only to that member and does not rotate the key. Consequently that member can decrypt retrievable earlier messages from the same epoch. The application generates, stores and distributes keys; the reducer does not generate or erase them. Removal, an explicit rekey, and an ownership transfer rotate the key and deliver the new key only to the members who remain. A removed person does not receive that key. Messages they already opened stay readable under the previous key. A later message uses the new epoch and does not open under the old key.

A `0x07` note is one payment to the mailbox. Its wire format is unchanged. The header is 54 bytes:

```
version 0x02 | protocol 0x07 | group id (32) | epoch (4, big-endian) | counter (4, big-endian) | nonce (12)
```

| `0x07` field | Offset | Bytes |
| --- | ---: | ---: |
| Version `0x02`, protocol `0x07` | 0, 1 | 1 each |
| Group id | 2 | 32 |
| Epoch | 34 | 4 |
| Counter | 38 | 4 |
| Nonce | 42 | 12 |
| Ciphertext and tag | 54 | plaintext length + 16 |

Associated data is the complete `note[0:54]` header. The message key is HKDF-SHA256, 32 bytes:

```
salt = epoch || counter
ikm  = group key
info = UTF-8 "AlgoChat-group-v1" || group id || sender address (32)
```

The salt is exactly eight bytes: `uint32_be(epoch) || uint32_be(counter)`. The sender address is the 32-byte **account public key from the authenticated payment**, not its X25519 encryption key and not the textual Algorand address. Epoch is 1 through 4294967295; counter is 0 through 4294967295, without wraparound. See the Kotlin range limitation in [implementation boundaries](docs/PROTOCOL-FLOWS.md#implementation-boundaries).

`counter` is per sender and per epoch. It starts at 0 and increases by 1. A repeated `(sender, epoch, counter)` MUST be rejected. The ciphertext and 16-byte tag follow. Maximum plaintext is 4026 bytes (4096 - 54 - 16). The recorded PQ level of the note is 3, because that is the level of the wrap that delivered the group key. A leaked message key opens that one note. A leaked group key opens every `0x07` note for that epoch. A later theft of a member's long-term X25519 key and ML-KEM key can open that member's `0x06` wraps.

The opening helper checks the caller-supplied accepted `(epoch, counter)` pairs but does not allocate counters or persist/mutate replay state. Scope that state to **group and sender**, and record a pair only after authentication and room authorization succeed. Applications must make acceptance atomic and distinguish an intentional history reread from a copied note in a different transaction. Successful AEAD opening proves key possession; any holder of the epoch key can derive another member's message key, so it does not replace transaction-sender authentication or membership checks.

Once a room has an accepted `0x03` chain, a client shows a mailbox note only when it opens under the key for that epoch and the payment sender is a member in the accepted state at that message's chain position (confirmed round, intra-round offset and transaction-id order), with a matching epoch. A note from anyone else is ignored. A legacy room with no `0x03` chain keeps the earlier rule: open with the known key and reject a repeated sender counter. Historical messages use the key for their epoch and membership at their chain position. Add/accept does not advance the epoch, so one epoch can contain different rosters; checking only an epoch-wide or latest roster is insufficient.

#### 5.8.4 Parity

This subsection preserves author-reported historical membership runs. They are not administration runs or independently reproduced evidence for the current checkout. The shared administration vectors are described in [TEST-VECTORS.md](TEST-VECTORS.md#room-administration).

On 2026-10-18 the driver `ts/scripts/group-matrix-localnet.ts` ran on LocalNet. The creator funded the mailbox with 100000 microAlgos in round 46313. Create notes for a group of three confirmed in rounds 46315 and 46316. Add notes for a fourth member confirmed in rounds 46317, 46318, and 46319. Remove notes, which were not sent to the removed member, confirmed in rounds 46320 and 46321. One `0x07` payment to the mailbox confirmed in round 46322. TypeScript, Go, Rust, Python, Kotlin, and Swift each produced the same note bytes, and each opened the mailbox note. Opening that note with the previous group key failed in every library. A repeated counter failed in every library. Identifier `0x03` was not used.

`vectors/group-v1.json` is the frozen membership note, message key, and message note. The session key in that file is an input, not a handshake output. Tag v1.3.0 does not include this run.

A second run, `ts/scripts/group-talk-localnet.ts`, put all six libraries in one group. TypeScript created a hybrid session with each other library. That library accepted the session and opened its own `0x06` note. The mailbox was funded in round 46375. Membership notes confirmed in rounds 46376 (Go), 46377 (Rust), 46378 (Python), 46379 (Kotlin), and 46380 (Swift). Each library then posted its own `0x07` line to that mailbox: TypeScript round 46381, Go 46382, Rust 46383, Python 46384, Kotlin 46385, and Swift 46386. Every library opened every line, 36 opens, with no failures. Identifier `0x03` was not used.

## 6. Encryption

### 6.1 Message Encryption (Sender → Recipient)

Sections 6–7 describe standard mode. `payload_aad` is empty for version `0x01` and the complete 126-byte fixed header for version `0x02`. Compute the sender-key wrap in section 6.2 before sealing the payload so that the header includes it. The wrap always uses empty associated data.

```
// Generate ephemeral key pair
ephemeral_private, ephemeral_public = GENERATE_KEYPAIR()

// Derive shared secret with recipient
shared_secret = X25519(ephemeral_private, recipient_public_key)

// Derive symmetric key
info = "AlgoChatV1" || sender_public_key || recipient_public_key
symmetric_key = HKDF-SHA256(shared_secret, ephemeral_public, info, 32)

// Choose the nonce, compute the sender wrap (section 6.2), then serialize the header
nonce = RANDOM(12)
encrypted_sender_key = wrap_symmetric_key_as_in_section_6_2()
payload_aad = empty_aad if version == 0x01 else serialize_fixed_header(envelope_fields)
ciphertext = ChaCha20-Poly1305-ENCRYPT(symmetric_key, nonce, plaintext, payload_aad)
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
encrypted_sender_key = ChaCha20-Poly1305-ENCRYPT(sender_encryption_key, nonce, symmetric_key, empty_aad)
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
payload_aad = empty_aad if envelope.version == 0x01 else serialize_fixed_header(envelope)
plaintext = ChaCha20-Poly1305-DECRYPT(symmetric_key, nonce, ciphertext, payload_aad)
```

### 7.2 Sender Decryption (Own Messages)

```
// Derive shared secret with self
sender_shared_secret = X25519(sender_private_key, ephemeral_public_key)

// Derive sender decryption key
sender_info = "AlgoChatV1-SenderKey" || sender_public_key
sender_decryption_key = HKDF-SHA256(sender_shared_secret, ephemeral_public_key, sender_info, 32)

// Decrypt the symmetric key
symmetric_key = ChaCha20-Poly1305-DECRYPT(sender_decryption_key, nonce, encrypted_sender_key, empty_aad)

// Decrypt message
payload_aad = empty_aad if envelope.version == 0x01 else serialize_fixed_header(envelope)
plaintext = ChaCha20-Poly1305-DECRYPT(symmetric_key, nonce, ciphertext, payload_aad)
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

For version `0x01`, `payload_aad` is empty. For version `0x02`, it is the complete 130-byte fixed header, including the counter and wrapped sender key. Compute the wrap first, with empty associated data, then seal the payload.

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

// Choose the nonce before wrapping the key
nonce = RANDOM(12)

// Encrypt symmetric key for sender
sender_shared_secret = X25519(ephemeral_private, sender_public_key)
sender_info = "AlgoChatV1-PSK-SenderKey" || sender_public_key
psk_sender_key = HKDF-SHA256(
    ikm:  sender_shared_secret || current_psk,
    salt: ephemeral_public,
    info: sender_info,
    length: 32
)
encrypted_sender_key = ChaCha20-Poly1305-ENCRYPT(psk_sender_key, nonce, psk_symmetric_key, empty_aad)

// Seal the payload after the complete fixed header is available
payload_aad = empty_aad if version == 0x01 else serialize_fixed_header(envelope_fields)
ciphertext = ChaCha20-Poly1305-ENCRYPT(psk_symmetric_key, nonce, plaintext, payload_aad)

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
payload_aad = empty_aad if envelope.version == 0x01 else serialize_fixed_header(envelope)
plaintext = ChaCha20-Poly1305-DECRYPT(psk_symmetric_key, nonce, ciphertext, payload_aad)

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

symmetric_key = ChaCha20-Poly1305-DECRYPT(psk_sender_key, nonce, encrypted_sender_key, empty_aad)
payload_aad = empty_aad if envelope.version == 0x01 else serialize_fixed_header(envelope)
plaintext = ChaCha20-Poly1305-DECRYPT(symmetric_key, nonce, ciphertext, payload_aad)
```

### 8.5 Counter Window

Implementations MUST maintain a counter window to handle out-of-order message delivery on the blockchain. The recommended window size is `COUNTER_WINDOW = 200` (2 full sessions).

Counter validation rules:
1. A counter value that has already been successfully decrypted MUST be rejected (replay protection)
2. A counter value more than `COUNTER_WINDOW` behind the highest seen counter SHOULD be rejected
3. A counter value more than `COUNTER_WINDOW` ahead of the highest seen counter SHOULD be rejected (potential attack or state desynchronization)
4. Within the window, any unseen counter value MUST be accepted regardless of order

These are protocol requirements, not a claim that every port persists or enforces this state. See [docs/ACCURACY.md](docs/ACCURACY.md) for implementation gaps.

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

The structured payloads below coexist with legacy raw UTF-8 text. Readers preserve legacy text rather than requiring every plaintext to parse as JSON. The byte limits apply to the actual encoded plaintext, including any JSON overhead.

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

Used to publish an encryption public key for key discovery. The `publicKey` payload field is optional and redundant with the envelope's sender-key field; `{"type":"key-publish"}` is also a valid marker and is filtered from user message lists:

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

The trustworthy sender address is the transaction's `sender`, not the envelope's `sender_pubkey`. Anyone can construct an envelope naming another X25519 key using public information. Clients must retain the transaction context and apply their key-binding policy; successfully decrypting an envelope alone does not authenticate its claimed sender.

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
| Room administration | `0x0203` | Public record sent to the mailbox |
| Hybrid handshake | `0x0204` | One 2366-byte session handshake |
| Hybrid message | `0x0205` | 78-byte header is payload associated data |
| Group key delivery | `0x0206` | 195-byte legacy or 227-byte action-5 note to one member |
| Group message | `0x0207` | 54-byte header is payload associated data; receiver is the mailbox |

`ACPQ` announcements have their own ASCII magic, not an envelope prefix. An application integrating rooms must query the mailbox for `0x0203` and `0x0207` and members' incoming payments for `0x0204`/`0x0206`; the existing classical client query does not provide that integration automatically.

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

**AlgoChat does not provide forward secrecy.** Standard and PSK messages use fresh ephemeral
key pairs, which separate per-message symmetric keys, but the ephemeral key belongs
to the *sender* and its public half travels in the envelope. In standard mode, recovering a message key
requires only a long-term private key and that public value:

```
shared_secret = X25519(recipient_private_key, envelope.ephemeral_public_key)
```

The envelope is stored permanently and publicly on the Algorand blockchain. An
attacker who obtains either party's long-term private key — or the recovery phrase
that derives it — can therefore retroactively decrypt **every base-mode message that account
has ever sent or received** (PSK-mode decryption additionally requires the PSK), and no revocation or key rotation can undo this,
because the ciphertext remains publicly retrievable forever.

In PSK mode (`0x02`) the pre-shared key is mixed into
HKDF alongside the ECDH secret, so an attacker needs the PSK *as well as* a
long-term key — a meaningful additional barrier, but not forward secrecy: the PSK
is static, and every position key is a deterministic function of it (see
[8.1](#81-psk-ratchet-mechanism)).

Hybrid mode (`0x04`/`0x05`) reuses the handshake session key for subsequent messages. The recipient can recover it with the long-term X25519 and ML-KEM keys; the sender can recover the wrapped copy with the sender's long-term X25519 and ML-KEM keys. These keys are deterministically recoverable from mnemonic entropy, so mnemonic compromise also exposes hybrid history. Compromise of a session key exposes every `0x05` message in that session.

No key material is ever ratcheted forward and destroyed. Achieving forward secrecy
would require a scheme such as the Double Ratchet, in which past keys become
unrecoverable after use.

**Implication for users:** a recovery phrase exposes the complete, permanent base-mode
message history of that account and derives the keys needed to recover hybrid history; PSK-mode history additionally requires the PSK. It must be protected accordingly.

### 11.2 Replay Protection

Transaction uniqueness prevents the identical signed transaction from being accepted twice. It does not prevent copying a note into a new transaction. PSK mode requires counter-based replay protection within the ratchet window (section 8.5). A group message rejects a repeated sender, epoch, and counter (section 5.8). Standard and hybrid applications must track transaction/session context as appropriate; there is no universal envelope-level replay cache. See [docs/ACCURACY.md](docs/ACCURACY.md) for port limitations.

### 11.3 Metadata Leakage

The following metadata is visible on-chain:
- Sender Algorand address
- Recipient Algorand address
- Timestamp (block time)
- Message size (approximate)
- Protocol mode (`0x01` through `0x07`) reveals standard, PSK, administration, handshake, session-message, group-key-delivery, or group-message use
- Public `0x03` records reveal the room name, joining policy, owner, admins, members, subjects and parent links; pending requests are derivable
- `0x07` exposes group id, epoch and sender counter; mailbox payments reveal participation even when the message stays encrypted
- Hybrid handshakes expose both X25519 keys; session messages expose their handshake hash

### 11.4 Key Compromise

For standard and PSK modes, if a recipient's X25519 private key is compromised:
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

For hybrid mode, the recipient path requires both the recipient's X25519 and ML-KEM keys, and the sender-copy path requires both of the sender's keys. The mnemonic derives both kinds of keys. A leaked session key exposes that session.

For a group, a leaked message key opens that one `0x07` note. A leaked group key opens every `0x07` note in that epoch. A later theft of a member's long-term X25519 key and ML-KEM key can open that member's `0x06` wraps.

Because compromise is retroactive and irreversible, key rotation limits future
exposure only. There is no mechanism to protect already-published ciphertext.

## 12. Constants

```
// Standard mode
PROTOCOL_VERSION       = 0x01  // Legacy empty-AAD envelope
PROTOCOL_VERSION_AAD   = 0x02  // Full fixed header as payload AAD; readers accept both
PROTOCOL_STANDARD      = 0x01
HEADER_SIZE            = 126
MAX_PAYLOAD_SIZE       = 3954

// PSK ratcheting mode
PROTOCOL_PSK_RATCHET   = 0x02
PSK_HEADER_SIZE        = 130
PSK_MAX_PAYLOAD_SIZE   = 3950
PSK_SESSION_SIZE       = 100
COUNTER_WINDOW         = 200

// Hybrid session (always envelope version 0x02)
PROTOCOL_PQ_HANDSHAKE  = 0x04
PROTOCOL_PQ_MESSAGE    = 0x05
PQ_HANDSHAKE_SIZE      = 2366
PQ_DATA_HEADER_SIZE    = 78
PQ_MAX_PAYLOAD_SIZE    = 4002

// Group mailbox (envelope version 0x02, tag v1.4.0)
PROTOCOL_GROUP_MEMBERSHIP = 0x06
PROTOCOL_GROUP_MESSAGE    = 0x07
GROUP_MEMBERSHIP_NOTE_SIZE = 195
GROUP_MESSAGE_HEADER_SIZE  = 54
GROUP_MAX_PAYLOAD_SIZE     = 4026
GROUP_INFO_LABEL           = "AlgoChat-group-v1"

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
| 1.4.0 | Group mailbox. Protocol `0x06` delivers a group key under a hybrid session. Protocol `0x07` is one note on that group's mailbox. Protocol `0x03` is the public room administration record. These ids were not in tag v1.3.0. |
