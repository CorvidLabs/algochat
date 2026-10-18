# Security Considerations

## Threat Model

### What AlgoChat Protects Against

1. **Message Content Disclosure** - Only sender and recipient can decrypt messages
2. **Message Tampering** - Authenticated encryption detects modifications
3. **Duplicate Signed Transactions** - Blockchain transaction uniqueness rejects resubmitting the same signed transaction. Copying its note into a new transaction is a separate replay concern; PSK mode requires counter tracking, and applications must retain transaction/session context.

### What AlgoChat Does NOT Protect Against

1. **Metadata Analysis** - Sender/recipient addresses, timing, and message sizes are visible
2. **Endpoint Compromise** - Malware on user devices can access decrypted messages
3. **Key Compromise** - Standard-mode history is readable after X25519 key compromise; PSK mode additionally requires the PSK, and hybrid mode requires both X25519 and ML-KEM material for the account's recovery path. A mnemonic derives both kinds of account encryption keys. Exposure of published history is retroactive and permanent.
4. **Past Message Exposure** - No forward secrecy: compromise of a long-term private key (or the recovery phrase that derives it) retroactively exposes that account's base-mode history; PSK-mode decryption additionally requires the PSK, and mnemonic compromise also recovers hybrid history (see [Forward Secrecy -- Not Provided](#forward-secrecy-not-provided))
5. **Traffic Analysis** - Transaction patterns may reveal communication patterns
6. **Algorand Network Attacks** - Protocol relies on blockchain security
7. **Quantum Attacks on Key Exchange** - X25519 is vulnerable to quantum computers. **With PSK mode (`0x02`)**, an attacker must also compromise the pre-shared key, providing defense-in-depth. Hybrid mode (`0x04`/`0x05`) instead combines X25519 with ML-KEM-768 for the recipient and sender-copy recovery paths. See [PSK Security Properties](#psk-security-properties) and [Hybrid Session Security](#hybrid-session-security) below. A Falcon-1024 **account** does not close this gap: it protects who can authorize the payment, not the X25519 handshake inside the note.
8. **Quantum Attacks on Ed25519 Identity** - A sufficiently large quantum computer can recover an Ed25519 private key from the public key encoded in a classical Algorand address. Native Falcon-1024 accounts (`pqsig`) resist that attack. They are optional in v1.2. Importing a 25-word phrase without an explicit Falcon scheme MUST keep the Ed25519 address so existing wallets do not silently move.

## Cryptographic Guarantees

### Confidentiality

- Messages encrypted with ChaCha20-Poly1305 (256-bit key)
- Standard message keys use X25519 ECDH (128-bit classical security level); PSK mode also mixes in the pre-shared key
- Optional hybrid session keys combine X25519 and ML-KEM-768; subsequent `0x05` messages reuse the established session key
- HKDF-SHA256 for key derivation with domain separation

### Integrity

- ChaCha20-Poly1305 provides authenticated encryption
- 128-bit authentication tag detects tampering in authenticated fields
- Standard and PSK version `0x02` payloads authenticate the complete fixed header; version `0x01` uses empty payload AAD. Their sender-key wraps use empty AAD in both versions. Hybrid wraps authenticate the handshake prefix and hybrid messages authenticate their 78-byte header
- Blockchain immutability prevents post-hoc modification

### Forward Secrecy Not Provided

AlgoChat does not provide forward secrecy. Each standard or PSK message uses a fresh ephemeral key pair, which separates per-message symmetric keys, but:

- The ephemeral key pair belongs to the sender, and its public half is published permanently on-chain in the envelope
- Recovering a message key requires only a long-term private key and that public value
- Compromise of either party's long-term key -- or the recovery phrase that derives it -- retroactively decrypts that account's base-mode messages; PSK-mode decryption additionally requires the PSK
- No revocation or key rotation can undo this; the ciphertext remains publicly retrievable forever

Ephemeral private keys are never stored, which limits endpoint exposure, but this is not forward secrecy. In PSK mode (`0x02`) an attacker needs the PSK as well -- a meaningful additional barrier, but the PSK is static and every position key is a deterministic function of it.

Hybrid mode also lacks forward secrecy. Long-term X25519 and ML-KEM keys reopen the account's sessions from published handshakes; the mnemonic derives both. A leaked session key exposes every message sent under that session.

**Implication for users:** a recovery phrase exposes the complete, permanent standard-mode history and derives the keys needed to reopen hybrid history; PSK-mode history additionally requires the PSK. Protect the phrase accordingly.

See [PROTOCOL.md §11.1](PROTOCOL.md#111-forward-secrecy--not-provided) for the full analysis.

## Key Management

### Key Derivation

- Encryption keys derived from the 32-byte entropy of the 25-word Algorand mnemonic
- That entropy is `sk[0:32]` for Ed25519 accounts and MUST NOT be taken from a Falcon-1024 secret key
- Deterministic derivation enables key recovery from the mnemonic regardless of whether payments are Ed25519- or Falcon-signed
- HKDF with domain-specific salt prevents key reuse across protocols
- The same mnemonic yields the same X25519 keys and, if Falcon is requested, a different Algorand address

### Key Storage

Implementations should:
- Store private keys in secure enclaves when available
- Use biometric protection for key access
- Clear keys from memory after use (see Memory Clearing below)
- Never log or transmit private keys

### Memory Clearing

Sensitive data (private keys, symmetric keys, plaintext, PSK material, derived session/position PSKs) must be cleared from memory after use. Standard deallocation does not guarantee memory is zeroed.

**Language-specific guidance:**

| Language | Recommended Approach |
|----------|---------------------|
| C/C++ | `sodium_memzero()` (libsodium) or `explicit_bzero()` |
| Rust | `zeroize` crate with `Zeroizing<T>` wrapper |
| Swift | `Data.resetBytes(in:)` or SecureBytes patterns |
| TypeScript/JS | Overwrite buffer contents, then discard reference |
| Python | Mutable buffers and native-library zeroization where supported; immutable `bytes` and the `secrets` module do not provide reliable erasure |
| Kotlin/Java | Overwrite `ByteArray` contents before GC |
| Go | `crypto/subtle.ConstantTimeCopy` to zero, or `memguard` |

**Important**: Garbage-collected languages cannot guarantee immediate clearing. Use native bindings (e.g., libsodium wrappers) for maximum security.

### Key Discovery

- Public keys discovered from transaction history
- Key publish transactions enable proactive key distribution
- Out-of-band key exchange supported
- Authorship is the payment's authorizing signature (`sig` or `pqsig`). An extra Ed25519 signature over the X25519 key is optional and is not defined for Falcon senders.

### Hybrid Key and Session Recovery

- Derive ML-KEM private material from the same protected mnemonic entropy as X25519, using the separate domain in PROTOCOL.md section 5.7. Neither private key belongs on chain.
- Recipient recovery needs both recipient long-term keys; sender-copy recovery needs both sender long-term keys. Compromising only one primitive does not open these paths under the hybrid assumptions.
- A cached session key is sufficient to decrypt every `0x05` message using it. Store it securely or reconstruct it from the original handshake and the account's long-term keys.
- Preserve the original handshake and its transaction identity when resolving the handshake hash in a message. Low-level cryptographic parsing does not establish the Algorand sender.
- Hybrid sessions are separate from PSK mode. The high-level conversation clients do not automatically negotiate hybrid mode; applications must integrate discovery, selection, handshake transport, and session recovery explicitly. See [docs/ACCURACY.md](docs/ACCURACY.md).

### PSK Key Management

When using PSK mode (`0x02`):

- **Generation**: The initial PSK MUST be generated using a CSPRNG (32 bytes)
- **Exchange**: The PSK SHOULD be exchanged in-person or over an authenticated, confidential channel (e.g., QR code shown face-to-face)
- **Storage**: The initial PSK MUST be stored in secure storage (Keychain, secure enclave, encrypted database). It is the root of trust for the entire PSK ratchet chain.
- **Counter State**: Ratchet counter state (send counter, peer last counter, seen counters) MUST be persisted to prevent replay attacks and counter drift across app restarts
- **Rotation**: There is no automatic PSK rotation. Users SHOULD periodically exchange a new PSK if long-term security is desired beyond the ratchet mechanism.
- **Revocation**: To revoke a PSK relationship, both parties must delete their stored PSK. Messages encrypted with the old PSK remain decryptable if the old PSK is retained.

## PSK Security Properties

### Hybrid Key Derivation

PSK mode (`0x02`) derives symmetric keys from the concatenation of the X25519 shared secret and the ratcheted PSK: `IKM = shared_secret || current_psk`. This means:

- If X25519 is broken (e.g., by a quantum computer) but the PSK remains secret, messages remain confidential
- If the PSK is compromised but X25519 remains secure, messages remain confidential
- An attacker must compromise **both** to decrypt messages

This is a defense-in-depth strategy. ML-KEM was standardized in [NIST FIPS 203](https://csrc.nist.gov/pubs/fips/203/final) in August 2024. AlgoChat 1.3 offers a separate hybrid X25519 + ML-KEM-768 mode; it does not replace PSK mode or silently change its key derivation.

### Session Key Separation

The ratchet mechanism bounds exposure within sessions, but provides no forward secrecy:

- Each session (100 messages) derives a unique `session_psk` from the `initial_psk`
- Each message position derives a unique `position_psk` from the `session_psk`
- Compromising a `position_psk` exposes only that one message
- Compromising a `session_psk` exposes at most 100 messages in that session
- Compromising the `initial_psk` exposes all past and future PSK-derived keys

Note: The PSK ratchet adds **breadth limitation** only. Every position key is a deterministic function of the `initial_psk` -- nothing is advanced-and-destroyed -- so this is a key schedule, not a ratchet in the Signal sense, and it does not provide forward secrecy.

### PSK Threat Matrix

| Threat | No PSK (`0x01`) | Ratcheting PSK (`0x02`) |
|--------|-----------------|-------------------------|
| Classical key exchange attack | Vulnerable | Protected (requires PSK) |
| Quantum key exchange attack | Vulnerable | Protected (requires PSK) |
| Long-term key compromise (future msgs) | Vulnerable | Protected (requires PSK) |
| Long-term key compromise (past msgs) | Vulnerable (retroactive, permanent) | Protected (requires PSK as well) |
| PSK compromise only | N/A | Protected (X25519 still required) |
| Both X25519 + PSK compromised | N/A | Vulnerable |
| Endpoint compromise | Vulnerable | Vulnerable |
| Metadata analysis | Visible | Visible |

### PSK Known Limitations

- **Counter drift**: If a device loses counter state (e.g., app reinstall), it may produce counters outside the peer's acceptance window. Recovery requires manual counter reset or PSK re-exchange.
- **~100 message blast radius**: Compromising a session PSK exposes up to 100 messages in that session. This is a design tradeoff for out-of-order delivery support.
- **Initial PSK is root of trust**: The entire ratchet chain is derived from the initial PSK. If the initial PSK was compromised during exchange, all derived keys are compromised.
- **No backward secrecy within a session**: The deterministic ratchet allows any position within a session to be derived from the session PSK. A ciphertext-dependent ratchet would provide backward secrecy but break out-of-order delivery.
- **Protocol mode visible**: The protocol byte (`0x01` vs `0x02`) reveals whether PSK is in use, which is metadata leakage.

## Hybrid Session Security

Protocols `0x04` and `0x05` combine X25519 with ML-KEM-768 (FIPS 203 category 3). The recipient key and sender-copy wrap each require both shared secrets. This protects against a break of only one key-exchange primitive, assuming the other primitive and the combiner remain secure. Later messages reuse the session key with fresh nonces; they do not create new per-message key-exchange secrets.

The long-term ML-KEM key can decapsulate every stored handshake addressed to that key. The sender wrap similarly remains recoverable with both sender long-term keys. There is no forward secrecy, automatic session-key ratchet, or general replay cache. Endpoint compromise, mnemonic compromise, and leaked session keys remain relevant. Payment authorization with Falcon-1024 is a separate account-layer choice.

The `ACPQ` announcement format supports an optional Ed25519 signature. A present invalid signature is rejected; an unsigned key is unverified. The payment's authorizing signature binds a confirmed note to the transaction sender, while the application remains responsible for key-binding policy and trusted chain/indexer data.

Using FIPS 203 algorithms is not a claim that any AlgoChat library is FIPS validated or independently audited. TypeScript currently uses `@noble/post-quantum` 0.7.1, for which this repository records no independent audit. The dated interoperability evidence in [PARITY.md](PARITY.md) does not establish an independent security audit or current-head qualification.

## Known Limitations

### Message Size

- Maximum plaintext: 3954 bytes (standard), 3950 bytes (PSK), 4002 bytes (hybrid session message)
- A hybrid handshake is a separate 2366-byte note
- Note limit: 4096 bytes. A note of 4097 bytes is not legal.
- Longer messages require application-level fragmentation

### Deniability

- Transaction authorization attributes the payment to its Algorand sender address
- The envelope's X25519 sender field alone does not prove who sent a note: encryption can be performed with public keys only
- No deniability guarantee is provided

### Group Messaging

- Protocol designed for 1:1 messaging
- Group chats require multiple encryptions or protocol extension

## Recommendations

### For Implementers

1. Choose maintained cryptographic libraries and assess audit coverage for the exact primitive and version in use. Standard primitives and passing interoperability tests do not establish an AlgoChat implementation audit
2. Implement constant-time operations where applicable:
   - Authentication tag comparison (use `crypto_verify_*` or `timingSafeEqual`)
   - Key comparison operations
   - Any branching on secret data
3. Validate all inputs before processing
4. Handle errors without leaking information (same error response for all auth failures)
5. Clear sensitive data from memory (see Memory Clearing section above)
6. Use secure random number generators (`/dev/urandom`, `SecRandomCopyBytes`, `crypto.getRandomValues`)
7. (PSK) Validate ratchet counters against the acceptance window before attempting decryption
8. (PSK) Persist counter state reliably -- loss of counter state degrades replay protection
9. (PSK) Set a reasonable counter window (recommended: 200) to balance out-of-order tolerance with replay resistance
10. (PSK) Provide clear UI indicators distinguishing PSK-protected conversations from standard ones
11. Retain the Algorand transaction sender/recipient context and validate key bindings; successful envelope decryption alone is not sender authentication
12. (Hybrid) Integrate announcement validation, handshake discovery, session recovery and replay policy explicitly; do not claim automatic negotiation from the presence of low-level helpers

These are requirements and recommendations for implementers. They do not certify that every port persists replay state, validates every malformed envelope, or clears every secret. Current gaps are tracked in [docs/ACCURACY.md](docs/ACCURACY.md).

### For Users

1. Protect your Algorand mnemonic
2. Use devices you trust
3. Verify recipient addresses carefully
4. Be aware of metadata exposure
5. Report suspicious behavior
6. (PSK) Exchange PSKs in person when possible -- the security of PSK mode depends entirely on the secrecy of the initial PSK
7. (PSK) Verify the PSK fingerprint (e.g., first 8 hex characters) with your contact after exchange
8. (PSK) Understand that PSK mode is defense-in-depth -- it strengthens security but does not replace the need for device security and mnemonic protection

## Reporting Vulnerabilities

**Do NOT report security vulnerabilities as public GitHub issues.**

**GitHub Security Advisory** (preferred): [Report a vulnerability](https://github.com/CorvidLabs/algochat/security/advisories/new)

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)
- Your contact information for follow-up

We aim to acknowledge reports within 48 hours and provide an initial assessment within 7 days. We will coordinate disclosure timing with you.
