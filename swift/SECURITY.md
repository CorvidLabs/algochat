# Security

## Cryptographic Guarantees

AlgoChat provides the following security properties:

### Confidentiality
- Messages encrypted with **ChaCha20-Poly1305** authenticated encryption
- Key agreement via **X25519** elliptic curve Diffie-Hellman
- Standard and PSK envelopes support decryption by the sender and intended recipient while their required secrets remain protected
- The low-level hybrid session API combines X25519 with ML-KEM-768; it is separate from the high-level client

### Forward secrecy
- Forward secrecy is not provided
- Compromising the relevant X25519 key opens standard history; PSK history also requires the initial PSK
- Hybrid recovery requires both the relevant X25519 and ML-KEM private keys, or an exposed session key. Account recovery material derives both account-based keys
- Standard/PSK messages use a fresh X25519 ephemeral key. Hybrid messages reuse the handshake session key; public handshake material remains on-chain

### Integrity
- **Poly1305 MAC** authenticates all ciphertext
- Tampered messages fail decryption with authentication error
- Blockchain immutability prevents post-delivery modification

### Authenticity
- Sender identity verified via Algorand transaction signature
- Sender's static public key included in envelope for key discovery
- Transaction ID provides non-repudiable proof of message origin

## Threat Model

### What AlgoChat Protects Against

| Threat | Protection |
|--------|------------|
| Eavesdropping | End-to-end encryption; only endpoints can decrypt |
| Message tampering | Authenticated encryption fails on modification |
| Replay attacks | The PSK manager rejects previously recorded counters. Standard and hybrid session encryption do not maintain replay state; a fresh transaction can carry copied note bytes |
| Key compromise (past messages) | No forward secrecy. Standard recovery needs the relevant X25519 key, PSK also needs the initial PSK, and hybrid recovery needs both hybrid private keys or the session key |
| Man-in-the-middle | Signed key announcements bind an X25519 key to an Ed25519 account; discovered envelope keys may be unverified and need an application trust policy |

### What AlgoChat Does NOT Protect Against

| Threat | Limitation |
|--------|------------|
| Endpoint compromise | If device is compromised, keys may be extracted |
| Traffic analysis | Message timing and size visible on blockchain |
| Recipient key compromise | Standard messages are exposed by the recipient's X25519 key. PSK and hybrid modes additionally require their other secrets as described above |
| Message deletion | Blockchain messages are permanent and immutable |
| Metadata privacy | Sender/recipient addresses visible on-chain |

## Key Management

### Key Derivation
- Encryption keys derived from Algorand account via **HKDF-SHA256**
- The 32-byte account seed is the HKDF input, with fixed salt `"AlgoChat-v1-encryption"` and info `"x25519-key"`
- `"AlgoChatV1"` and `"AlgoChatV1-SenderKey"` are separate per-message derivation labels; the account address is not the account-key salt

### Key Storage

**Apple Platforms (macOS, iOS, visionOS):**
- X25519 private-key bytes are stored as Keychain generic-password items and loaded into process memory on retrieval
- Without user-presence protection, accessibility is `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`
- With `requireBiometric: true`, the item uses `kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly` and `.userPresence` (biometrics or device passcode)
- Items are device-only and not synchronized to iCloud; this is not Secure Enclave key storage

**FileKeyStorage (cross-platform, explicitly selected):**
- Keys encrypted with **AES-256-GCM**
- Password-based key derivation via **PBKDF2** (100,000 iterations)
- Storage file permissions set to `0600` (owner read/write only)

`KeychainKeyStorage` on tvOS, watchOS and Linux uses an in-memory fallback and loses keys at process exit; it does not automatically select encrypted file storage. `FilePSKStorage` contact/state files and the file send queue are plaintext JSON. See [implementation gaps](../docs/ACCURACY.md) for accepted requirements that current storage and decoding do not fully meet.

## Implementation Details

### Cryptographic Primitives
| Primitive | Algorithm | Library |
|-----------|-----------|---------|
| Key Agreement | X25519 | swift-crypto |
| Symmetric Encryption | ChaCha20-Poly1305 | swift-crypto |
| Key Derivation | HKDF-SHA256 | swift-crypto |
| Password KDF | PBKDF2-HMAC-SHA256 | CommonCrypto where available; otherwise local PBKDF2 using swift-crypto HMAC |
| Random Generation | SecRandomCopyBytes / /dev/urandom | Platform |

### Standard Envelope Format
```
[version: 1][protocol: 1][sender_pubkey: 32][ephemeral_pubkey: 32][nonce: 12][encrypted_sender_key: 48][ciphertext: variable]
```

Standard and PSK encryption write version `0x01`, whose payload has empty associated data. Reads also accept version `0x02`, whose complete fixed header is authenticated as payload AAD. Hybrid session envelopes use version `0x02`.

- **Total overhead:** 142 bytes (126-byte header + 16-byte auth tag)
- **Maximum plaintext:** 3954 bytes per message (3950 bytes in PSK mode)

## Security Assumptions

1. **Algorand blockchain is available and honest** - Messages rely on blockchain for delivery and ordering
2. **Cryptographic dependencies are correctly implemented** - The package relies on swift-crypto and platform cryptographic APIs; their use does not constitute an audit of AlgoChat
3. **Platform random number generator is secure** - SecRandomCopyBytes on Apple, /dev/urandom on Linux
4. **User protects their device** - Endpoint security is user's responsibility

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it privately:

1. **Do not** open a public GitHub issue
2. Email security concerns to the repository maintainers
3. Include steps to reproduce and potential impact
4. Allow reasonable time for a fix before public disclosure

## Audit Status

This library has not undergone a formal security audit. It uses established primitives through swift-crypto and platform APIs. Users requiring independent assurance should commission a review of the protocol composition and this implementation.
