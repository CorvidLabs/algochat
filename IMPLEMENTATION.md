# AlgoChat Implementation Guide

Language-agnostic pseudocode for implementing the AlgoChat protocol. PSK sections (added in v1.1) use Swift-style pseudocode. These examples describe the protocol contract; they are not a claim that every port or high-level client enforces every requirement. See [docs/ACCURACY.md](docs/ACCURACY.md) for implementation gaps.

## Dependencies

Your implementation needs:

1. **X25519** - Elliptic curve Diffie-Hellman
2. **ChaCha20-Poly1305** - Authenticated encryption
3. **HKDF-SHA256** - Key derivation
4. **Algorand SDK** - Transaction creation and submission. Sending from a
   Falcon-1024 account requires an SDK that can attach a `pqsig` (for example
   js-algorand-sdk ≥ 3.7.0). Envelope encode/decode does not.
5. **ML-KEM-768** (optional hybrid mode) - FIPS 203 key encapsulation, combined with X25519 as specified in [PROTOCOL.md section 5.7](PROTOCOL.md#57-hybrid-session-protocols-0x04-and-0x05). A standardized algorithm does not establish implementation audit or FIPS validation.

The 32-byte value passed to `deriveEncryptionKeys` is **mnemonic entropy**,
not "whatever signing key the wallet currently holds." For Ed25519 accounts
that entropy is `sk[0:32]`. For Falcon-1024 accounts it is still the 32-byte
seed decoded from the 25-word mnemonic. Never slice a Falcon secret key.

## Core Functions

### Key Derivation

```pseudocode
function deriveEncryptionKeys(mnemonicEntropy: bytes[32]) -> KeyPair:
    salt = encode("AlgoChat-v1-encryption")
    info = encode("x25519-key")

    encryptionSeed = HKDF_SHA256(
        ikm: mnemonicEntropy,
        salt: salt,
        info: info,
        length: 32
    )

    privateKey = encryptionSeed
    publicKey = X25519_GetPublicKey(privateKey)

    return KeyPair(privateKey, publicKey)
```

### Ephemeral Key Generation

```pseudocode
function generateEphemeralKeyPair() -> KeyPair:
    privateKey = secureRandomBytes(32)
    publicKey = X25519_GetPublicKey(privateKey)
    return KeyPair(privateKey, publicKey)
```

### Message Encryption

```pseudocode
function encryptMessage(
    plaintext: string,
    senderPublicKey: bytes[32],
    recipientPublicKey: bytes[32],
    version: uint8 = 0x02
) -> Envelope:

    if version != 0x01 and version != 0x02:
        throw Error("Unknown protocol version")
    messageBytes = encode(plaintext)

    if length(messageBytes) > 3954:
        throw Error("Message too large")

    // Generate ephemeral key pair
    ephemeral = generateEphemeralKeyPair()

    // Derive shared secret with recipient
    sharedSecret = X25519_ECDH(ephemeral.privateKey, recipientPublicKey)

    // Derive symmetric key
    info = concat("AlgoChatV1", senderPublicKey, recipientPublicKey)
    symmetricKey = HKDF_SHA256(
        ikm: sharedSecret,
        salt: ephemeral.publicKey,
        info: info,
        length: 32
    )

    // Select one nonce; wrap first so the complete fixed header is available
    nonce = secureRandomBytes(12)

    // Encrypt symmetric key for sender (bidirectional decryption)
    senderSharedSecret = X25519_ECDH(ephemeral.privateKey, senderPublicKey)
    senderInfo = concat("AlgoChatV1-SenderKey", senderPublicKey)
    senderEncryptionKey = HKDF_SHA256(
        ikm: senderSharedSecret,
        salt: ephemeral.publicKey,
        info: senderInfo,
        length: 32
    )
    encryptedSenderKey = ChaCha20Poly1305_Encrypt(senderEncryptionKey, nonce, symmetricKey, aad: emptyBytes)
    header = concat([version, 0x01], senderPublicKey, ephemeral.publicKey, nonce, encryptedSenderKey)
    payloadAAD = emptyBytes if version == 0x01 else header
    ciphertext = ChaCha20Poly1305_Encrypt(symmetricKey, nonce, messageBytes, aad: payloadAAD)

    return Envelope(
        version: version,
        protocolId: 0x01,
        senderPublicKey: senderPublicKey,
        ephemeralPublicKey: ephemeral.publicKey,
        nonce: nonce,
        encryptedSenderKey: encryptedSenderKey,
        ciphertext: ciphertext
    )
```

### Message Decryption

```pseudocode
function decryptMessage(
    envelope: Envelope,
    myPrivateKey: bytes[32],
    myPublicKey: bytes[32]
) -> string | null:

    weAreSender = (myPublicKey == envelope.senderPublicKey)

    if weAreSender:
        plaintext = decryptAsSender(envelope, myPrivateKey, myPublicKey)
    else:
        plaintext = decryptAsRecipient(envelope, myPrivateKey, myPublicKey)

    // Structured payloads coexist with legacy raw UTF-8 text
    text = decodeUTF8(plaintext)
    payload = tryParseJSON(text)
    if payload?.type == "key-publish":
        return null  // Not a user message
    if typeof(payload?.text) == string:
        return payload.text
    return text


function decryptAsRecipient(
    envelope: Envelope,
    recipientPrivateKey: bytes[32],
    recipientPublicKey: bytes[32]
) -> bytes:

    // Derive shared secret
    sharedSecret = X25519_ECDH(recipientPrivateKey, envelope.ephemeralPublicKey)

    // Derive symmetric key
    info = concat("AlgoChatV1", envelope.senderPublicKey, recipientPublicKey)
    symmetricKey = HKDF_SHA256(
        ikm: sharedSecret,
        salt: envelope.ephemeralPublicKey,
        info: info,
        length: 32
    )

    // Version 0x02 binds the full fixed header, including the sender-key wrap
    return ChaCha20Poly1305_Decrypt(symmetricKey, envelope.nonce, envelope.ciphertext, aad: payloadAAD(envelope))


function decryptAsSender(
    envelope: Envelope,
    senderPrivateKey: bytes[32],
    senderPublicKey: bytes[32]
) -> bytes:

    // Derive shared secret with self
    sharedSecret = X25519_ECDH(senderPrivateKey, envelope.ephemeralPublicKey)

    // Derive sender decryption key
    senderInfo = concat("AlgoChatV1-SenderKey", senderPublicKey)
    senderDecryptionKey = HKDF_SHA256(
        ikm: sharedSecret,
        salt: envelope.ephemeralPublicKey,
        info: senderInfo,
        length: 32
    )

    // Decrypt the symmetric key
    symmetricKey = ChaCha20Poly1305_Decrypt(
        senderDecryptionKey,
        envelope.nonce,
        envelope.encryptedSenderKey,
        aad: emptyBytes
    )

    // Version 0x02 binds the full fixed header, including the sender-key wrap
    return ChaCha20Poly1305_Decrypt(symmetricKey, envelope.nonce, envelope.ciphertext, aad: payloadAAD(envelope))
```

The sender/recipient branch selects a decryption path; it does not authenticate the Algorand sender. The displayed sender comes from the transaction's `sender` field and a validated binding to that address. Public-key-only encryption can construct an envelope naming someone else's X25519 key.

### Envelope Serialization

```pseudocode
function serializeEnvelope(envelope: Envelope) -> bytes:
    return concat(
        [envelope.version],           // 1 byte
        [envelope.protocolId],        // 1 byte
        bigEndianUInt32(envelope.ratchetCounter) if envelope.protocolId == 0x02 else emptyBytes,
        envelope.senderPublicKey,     // 32 bytes
        envelope.ephemeralPublicKey,  // 32 bytes
        envelope.nonce,               // 12 bytes
        envelope.encryptedSenderKey,  // 48 bytes
        envelope.ciphertext           // variable
    )


function deserializeEnvelope(data: bytes) -> Envelope:
    if length(data) < 2:
        throw Error("Envelope too short")

    version = data[0]
    protocolId = data[1]

    if version != 0x01 and version != 0x02:
        throw Error("Unknown protocol version")

    if protocolId == 0x01:
        // Standard mode
        if length(data) < 142 or length(data) > 4096:
            throw Error("Invalid envelope length for standard mode")
        return Envelope(
            version: version,
            protocolId: protocolId,
            ratchetCounter: nil,
            senderPublicKey: data[2:34],
            ephemeralPublicKey: data[34:66],
            nonce: data[66:78],
            encryptedSenderKey: data[78:126],
            ciphertext: data[126:]
        )

    else if protocolId == 0x02:
        // PSK ratcheting mode
        if length(data) < 146 or length(data) > 4096:
            throw Error("Invalid envelope length for PSK mode")
        ratchetCounter = bigEndianUInt32(data[2:6])
        return Envelope(
            version: version,
            protocolId: protocolId,
            ratchetCounter: ratchetCounter,
            senderPublicKey: data[6:38],
            ephemeralPublicKey: data[38:70],
            nonce: data[70:82],
            encryptedSenderKey: data[82:130],
            ciphertext: data[130:]
        )

    else:
        throw Error("Unknown protocol identifier; dispatch 0x04/0x05 to hybrid parser")


function payloadAAD(envelope: Envelope) -> bytes:
    if envelope.version == 0x01:
        return emptyBytes
    headerSize = 130 if envelope.protocolId == 0x02 else 126
    return serializeEnvelope(envelope)[0:headerSize]
```

The minimum includes the 16-byte payload authentication tag. Keep this validation even if a port currently accepts a header-only note; see [docs/ACCURACY.md](docs/ACCURACY.md). Hybrid notes use separate parsers and layouts, described below.

### Transaction Creation

```pseudocode
function createMessageTransaction(
    sender: AlgorandAddress,
    recipient: AlgorandAddress,
    envelope: Envelope,
    algodClient: AlgodClient
) -> PaymentTransaction:

    params = algodClient.getTransactionParams()

    txn = PaymentTransaction(
        sender: sender,
        receiver: recipient,
        amount: 0,
        note: serializeEnvelope(envelope),
        suggestedParams: params
    )

    return txn
```

### Key Discovery

```pseudocode
function discoverPublicKey(
    address: AlgorandAddress,
    indexerClient: IndexerClient
) -> bytes[32] | null:

    // Search both accepted versions of standard and PSK envelopes.
    prefixes = [[0x01, 0x01], [0x02, 0x01], [0x01, 0x02], [0x02, 0x02]]
    for prefix in prefixes:
        // Paginate until found or an explicit application search limit is reached.
        for txn in indexerClient.paginateTransactions(sender: address, notePrefix: prefix):
            if txn.sender != address:
                continue
            try:
                envelope = deserializeEnvelope(txn.note)
                return envelope.senderPublicKey
            catch:
                continue

    return null
```

Current TypeScript discovery also scans self-payment X25519 announcements, prefers a valid signed announcement over unsigned candidates, and rejects `ACPQ` notes in the X25519 announcement parser. Its paginated API defaults to pages of 100 with no depth cap; the non-paginated fallback defaults to a 1000-transaction batch. Other adapters can impose limits. Hybrid announcements (`ACPQ`), handshakes (`0x0204`), and messages (`0x0205`) need their own discovery and dispatch rather than this classical envelope deserializer.

## Data Structures

```pseudocode
struct KeyPair:
    privateKey: bytes[32]
    publicKey: bytes[32]

struct Envelope:
    version: uint8
    protocolId: uint8
    ratchetCounter: uint32?     // Present only for protocol 0x02 (PSK)
    senderPublicKey: bytes[32]
    ephemeralPublicKey: bytes[32]
    nonce: bytes[12]
    encryptedSenderKey: bytes[48]
    ciphertext: bytes[]

struct Message:
    id: string           // Transaction ID
    sender: string       // Algorand address
    recipient: string    // Algorand address
    content: string      // Decrypted text
    timestamp: DateTime
    direction: "sent" | "received"
    replyContext?: ReplyContext

struct ReplyContext:
    txid: string
    preview: string

struct MessagePayload:
    text: string
    replyTo?: ReplyReference

struct ReplyReference:
    txid: string
    preview: string

struct KeyPublishPayload:
    type: "key-publish"
    publicKey?: string  // Optional, base64 encoded; redundant with envelope sender key
```

## Error Handling

```pseudocode
enum AlgoChatError:
    INVALID_ENVELOPE          // Malformed envelope data
    UNKNOWN_VERSION           // Unsupported protocol version
    UNKNOWN_PROTOCOL          // Unrecognized protocol byte
    DECRYPTION_FAILED         // Authentication tag mismatch
    MESSAGE_TOO_LARGE         // Exceeds payload limit (3954 standard, 3950 PSK)
    KEY_NOT_FOUND             // Could not discover recipient key
    TRANSACTION_FAILED        // Blockchain submission error
    PSK_NOT_FOUND             // No PSK established for this contact
    PSK_COUNTER_OUT_OF_RANGE  // Ratchet counter outside acceptable window
    PSK_COUNTER_REPLAY        // Ratchet counter already seen (replay)
```

## Testing Vectors

### Key Derivation Test

```
Input seed (hex): 0x0000...0000 (32 zero bytes)
Salt: "AlgoChat-v1-encryption"
Info: "x25519-key"

Expected private key (hex): 1bd5f8356b720b8fc639fdd240409d4f76fa0ec52ebcd5351e80235d1ceed32f
Expected public key (hex): 7e8d332a8d69b9a69fd394b5dfb9716b1ec442482c7374c257dbb1f7a61e1014
```

### Encryption Test

Use known test vectors to verify your implementation matches other implementations.

## Security Checklist

- [ ] Use cryptographically secure random number generator
- [ ] Clear sensitive data from memory after use
- [ ] Validate envelope format before processing
- [ ] Handle decryption failures gracefully
- [ ] Never log or expose private keys
- [ ] Use constant-time comparison for authentication tags
- [ ] (PSK) Store initial PSK in secure storage (Keychain, secure enclave)
- [ ] (PSK) Persist ratchet counter state to prevent replay and counter drift
- [ ] (PSK) Clear PSK state from memory after use

## PSK Ratcheting Mode (v1.1)

The following sections use Swift-style pseudocode to describe PSK ratcheting mode (protocol `0x02`).

### PSK Data Structures

```swift
struct PSKContact: Sendable {
    let address: AlgorandAddress
    let initialPSK: Data          // 32 bytes, from out-of-band exchange
    let label: String?            // Human-readable display name
}

struct PSKState: Sendable {
    let contact: PSKContact
    var sendCounter: UInt32       // Next counter to use when sending
    var peerLastCounter: UInt32   // Highest counter seen from peer
    var seenCounters: Set<UInt32> // Counters successfully decrypted (within window)
}

struct PSKEnvelope: Sendable {
    let version: UInt8            // 0x01 (empty payload AAD) or 0x02 (full fixed header AAD)
    let protocolId: UInt8         // 0x02
    let ratchetCounter: UInt32
    let senderPublicKey: Data     // 32 bytes
    let ephemeralPublicKey: Data  // 32 bytes
    let nonce: Data               // 12 bytes
    let encryptedSenderKey: Data  // 48 bytes
    let ciphertext: Data          // variable
}
```

### PSK Ratchet Derivation

```swift
/// Derives the position PSK for a given ratchet counter.
/// This is a pure function: the same inputs always produce the same output.
func derivePSKAtCounter(
    initialPSK: Data,
    counter: UInt32
) -> Data {
    let sessionSize: UInt32 = 100
    let sessionIndex = counter / sessionSize
    let position = counter % sessionSize

    // Stage 1: Session PSK
    let sessionPSK = hkdfSHA256(
        ikm: initialPSK,
        salt: Data("AlgoChat-PSK-Session".utf8),
        info: sessionIndex.bigEndianData,  // 4 bytes
        length: 32
    )

    // Stage 2: Position PSK
    let positionPSK = hkdfSHA256(
        ikm: sessionPSK,
        salt: Data("AlgoChat-PSK-Position".utf8),
        info: position.bigEndianData,      // 4 bytes
        length: 32
    )

    return positionPSK
}

/// Derives the session PSK for a given session index.
/// Useful for cache optimization (cache per-session, derive per-position).
func deriveSessionPSK(
    initialPSK: Data,
    sessionIndex: UInt32
) -> Data {
    return hkdfSHA256(
        ikm: initialPSK,
        salt: Data("AlgoChat-PSK-Session".utf8),
        info: sessionIndex.bigEndianData,
        length: 32
    )
}
```

### PSK Symmetric Key Derivation

```swift
/// Derives the hybrid symmetric key for PSK mode.
/// Mixes X25519 shared secret with the ratcheted PSK.
func derivePSKSymmetricKey(
    sharedSecret: Data,
    currentPSK: Data,
    ephemeralPublicKey: Data,
    senderPublicKey: Data,
    recipientPublicKey: Data
) -> Data {
    let ikm = sharedSecret + currentPSK
    let info = Data("AlgoChatV1-PSK".utf8) + senderPublicKey + recipientPublicKey

    return hkdfSHA256(
        ikm: ikm,
        salt: ephemeralPublicKey,
        info: info,
        length: 32
    )
}

/// Derives the sender key for PSK mode (bidirectional decryption).
func derivePSKSenderKey(
    senderSharedSecret: Data,
    currentPSK: Data,
    ephemeralPublicKey: Data,
    senderPublicKey: Data
) -> Data {
    let ikm = senderSharedSecret + currentPSK
    let info = Data("AlgoChatV1-PSK-SenderKey".utf8) + senderPublicKey

    return hkdfSHA256(
        ikm: ikm,
        salt: ephemeralPublicKey,
        info: info,
        length: 32
    )
}
```

### PSK Message Encryption

```swift
func encryptMessagePSK(
    plaintext: String,
    senderKeyPair: KeyPair,
    recipientPublicKey: Data,
    pskState: inout PSKState,
    version: UInt8 = 0x02
) throws -> PSKEnvelope {
    guard version == 0x01 || version == 0x02 else {
        throw AlgoChatError.unknownVersion
    }
    let messageBytes = Data(plaintext.utf8)

    guard messageBytes.count <= 3950 else {
        throw AlgoChatError.messageTooLarge
    }

    // Derive ratcheted PSK for current counter
    let counter = pskState.sendCounter
    let currentPSK = derivePSKAtCounter(
        initialPSK: pskState.contact.initialPSK,
        counter: counter
    )

    // Generate ephemeral key pair
    let ephemeral = generateEphemeralKeyPair()

    // Derive hybrid symmetric key (ECDH + PSK)
    let sharedSecret = x25519ECDH(ephemeral.privateKey, recipientPublicKey)
    let symmetricKey = derivePSKSymmetricKey(
        sharedSecret: sharedSecret,
        currentPSK: currentPSK,
        ephemeralPublicKey: ephemeral.publicKey,
        senderPublicKey: senderKeyPair.publicKey,
        recipientPublicKey: recipientPublicKey
    )

    // Wrap first so version 0x02 can authenticate the full fixed header
    let nonce = secureRandomBytes(12)

    // Encrypt symmetric key for sender (bidirectional decryption)
    let senderSharedSecret = x25519ECDH(ephemeral.privateKey, senderKeyPair.publicKey)
    let senderKey = derivePSKSenderKey(
        senderSharedSecret: senderSharedSecret,
        currentPSK: currentPSK,
        ephemeralPublicKey: ephemeral.publicKey,
        senderPublicKey: senderKeyPair.publicKey
    )
    let encryptedSenderKey = chacha20Poly1305Encrypt(senderKey, nonce, symmetricKey, aad: Data())
    let header = Data([version, 0x02]) + counter.bigEndianData
        + senderKeyPair.publicKey + ephemeral.publicKey + nonce + encryptedSenderKey
    let aad = version == 0x01 ? Data() : header
    let ciphertext = chacha20Poly1305Encrypt(symmetricKey, nonce, messageBytes, aad: aad)

    // Increment counter for next message
    pskState.sendCounter = counter + 1

    return PSKEnvelope(
        version: version,
        protocolId: 0x02,
        ratchetCounter: counter,
        senderPublicKey: senderKeyPair.publicKey,
        ephemeralPublicKey: ephemeral.publicKey,
        nonce: nonce,
        encryptedSenderKey: encryptedSenderKey,
        ciphertext: ciphertext
    )
}
```

### PSK Message Decryption

```swift
func decryptMessagePSK(
    envelope: PSKEnvelope,
    myKeyPair: KeyPair,
    pskState: inout PSKState
) throws -> String {
    let counter = envelope.ratchetCounter
    let counterWindow: UInt32 = 200

    let weAreSender = (myKeyPair.publicKey == envelope.senderPublicKey)

    // Validate counter window (for received messages)
    if !weAreSender {
        if counter > pskState.peerLastCounter + counterWindow {
            throw AlgoChatError.pskCounterOutOfRange
        }
        if pskState.peerLastCounter > counterWindow,
           counter < pskState.peerLastCounter - counterWindow {
            throw AlgoChatError.pskCounterOutOfRange
        }
        if pskState.seenCounters.contains(counter) {
            throw AlgoChatError.pskCounterReplay
        }
    }

    // Derive ratcheted PSK
    let currentPSK = derivePSKAtCounter(
        initialPSK: pskState.contact.initialPSK,
        counter: counter
    )

    let plaintext: Data
    let aad = envelope.version == 0x01 ? Data() : serializePSKEnvelope(envelope).prefix(130)

    if weAreSender {
        // Decrypt as sender (via encrypted_sender_key)
        let senderSharedSecret = x25519ECDH(myKeyPair.privateKey, envelope.ephemeralPublicKey)
        let senderKey = derivePSKSenderKey(
            senderSharedSecret: senderSharedSecret,
            currentPSK: currentPSK,
            ephemeralPublicKey: envelope.ephemeralPublicKey,
            senderPublicKey: myKeyPair.publicKey
        )

        let symmetricKey = try chacha20Poly1305Decrypt(
            senderKey,
            envelope.nonce,
            envelope.encryptedSenderKey,
            aad: Data()
        )
        plaintext = try chacha20Poly1305Decrypt(
            symmetricKey,
            envelope.nonce,
            envelope.ciphertext,
            aad: aad
        )
    } else {
        // Decrypt as recipient
        let sharedSecret = x25519ECDH(myKeyPair.privateKey, envelope.ephemeralPublicKey)
        let symmetricKey = derivePSKSymmetricKey(
            sharedSecret: sharedSecret,
            currentPSK: currentPSK,
            ephemeralPublicKey: envelope.ephemeralPublicKey,
            senderPublicKey: envelope.senderPublicKey,
            recipientPublicKey: myKeyPair.publicKey
        )

        plaintext = try chacha20Poly1305Decrypt(
            symmetricKey,
            envelope.nonce,
            envelope.ciphertext,
            aad: aad
        )

        // Update counter tracking
        pskState.seenCounters.insert(counter)
        if counter > pskState.peerLastCounter {
            pskState.peerLastCounter = counter
        }
    }

    guard let text = String(data: plaintext, encoding: .utf8) else {
        throw AlgoChatError.decryptionFailed
    }
    return text
}
```

### PSK Envelope Serialization

```swift
func serializePSKEnvelope(_ envelope: PSKEnvelope) -> Data {
    var data = Data()
    data.append(envelope.version)                          // 1 byte
    data.append(envelope.protocolId)                       // 1 byte
    data.append(envelope.ratchetCounter.bigEndianData)     // 4 bytes
    data.append(envelope.senderPublicKey)                  // 32 bytes
    data.append(envelope.ephemeralPublicKey)                // 32 bytes
    data.append(envelope.nonce)                            // 12 bytes
    data.append(envelope.encryptedSenderKey)               // 48 bytes
    data.append(envelope.ciphertext)                       // variable
    return data
}
```

### PSK Exchange URI

```swift
/// Generates a PSK exchange URI for sharing via QR code or link.
func generatePSKExchangeURI(
    address: AlgorandAddress,
    psk: Data,
    label: String?
) -> String {
    let pskBase64URL = psk.base64URLEncodedString()  // No padding
    var uri = "algochat-psk://v1?addr=\(address)&psk=\(pskBase64URL)"
    if let label {
        let encoded = label.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? label
        uri += "&label=\(encoded)"
    }
    return uri
}

/// Parses a PSK exchange URI.
func parsePSKExchangeURI(_ uri: String) throws -> PSKContact {
    guard uri.hasPrefix("algochat-psk://v1?") else {
        throw AlgoChatError.invalidEnvelope
    }

    let queryString = String(uri.dropFirst("algochat-psk://v1?".count))
    let params = parseQueryParameters(queryString)

    guard let addrString = params["addr"],
          let pskString = params["psk"],
          let pskData = Data(base64URLEncoded: pskString),
          pskData.count == 32 else {
        throw AlgoChatError.invalidEnvelope
    }

    return PSKContact(
        address: AlgorandAddress(addrString),
        initialPSK: pskData,
        label: params["label"]?.removingPercentEncoding
    )
}
```

### UI/UX Guidance

Implementations SHOULD provide the following user experience for PSK mode:

**Visual Indicators:**
- Display a distinct icon or badge for PSK-protected conversations
- Show the ratchet counter or session number in developer/debug views
- Indicate when a PSK conversation is established vs. standard mode

**Setup Flow:**
1. User generates a PSK for a contact (32 bytes from CSPRNG)
2. App encodes PSK as `algochat-psk://` URI and displays QR code
3. Contact scans QR code, app parses URI and stores PSK
4. Both apps confirm PSK is established and switch to protocol `0x02`

**Error UX:**
- `PSK_NOT_FOUND`: Prompt user to set up PSK with this contact
- `PSK_COUNTER_OUT_OF_RANGE`: Warn about possible desynchronization; recover counter state from authenticated history or exchange a new PSK. Avoid blindly resetting counters while keeping the same replay state.
- `PSK_COUNTER_REPLAY`: Silently discard (do not display to user, but log for debugging)


## Hybrid Sessions (v1.3, `0x04` and `0x05`)

These are a separate mode from Extra lock (`0x02`); hybrid mode does not automatically add a PSK. The byte layouts and KDF transcript in [PROTOCOL.md section 5.7](PROTOCOL.md#57-hybrid-session-protocols-0x04-and-0x05) are normative.

1. Derive the account's ML-KEM-768 key from mnemonic entropy using the documented HKDF salts and info values. Obtain the recipient's X25519 and ML-KEM encapsulation keys through a trusted binding to the recipient address. `ACPQ` announcements are separate from X25519 announcements; a present invalid signature must fail verification.
2. Create a 2366-byte version `0x02`, protocol `0x04` handshake. Its recipient key combines X25519 and ML-KEM shared secrets. Its sender-copy wrap also combines both secrets, and authenticates the 2318-byte prefix before the wrapped session key.
3. The recipient reopens the session with its long-term X25519 and ML-KEM keys. The sender reopens the wrapped session with the sender's long-term X25519 and ML-KEM keys. The session identifier is SHA-256 of the complete handshake note.
4. Send version `0x02`, protocol `0x05` messages with the session key. Each message gets a fresh 12-byte nonce and authenticates its full 78-byte header. Maximum plaintext is 4002 bytes; the minimum note is 94 bytes, and a 3-byte plaintext produces 97 bytes.
5. Resolve a message's handshake hash to the original handshake note before decrypting it. Retain the associated transaction sender/recipient context and apply the application's replay and identity policy.

TypeScript exposes these low-level operations through `initiatePQSession`, `acceptPQSession`, `openPQSessionAsSender`, `encryptPQMessage`, and `decryptPQMessage` in `ts/src/pq/session.ts`. The six libraries contain hybrid helpers, but their ordinary high-level conversation send paths do not automatically discover ML-KEM keys, select hybrid mode, submit the handshake, or restore sessions. Applications must integrate those steps explicitly; see [docs/ACCURACY.md](docs/ACCURACY.md). A lack of automatic integration is not a change to the accepted protocol contract.

A saved session key is sensitive: it opens every message under that session. Both parties can instead recover it from the handshake and their long-term keys, so this mode does not provide forward secrecy. Protect the mnemonic and ML-KEM private material alongside the X25519 key. Rotation cannot make already published ciphertext disappear.

## Hybrid and room integration

The [protocol flow guide](docs/PROTOCOL-FLOWS.md) gives separate diagrams for discovery, both handshake recovery paths, administration, delivery and mailbox messages. The exact byte tables and KDF inputs are normative in [PROTOCOL.md sections 5.7–5.8](PROTOCOL.md#57-hybrid-session-protocols-0x04-and-0x05). The classical pseudocode above does not automatically handle these modes.

For a room client, retain authenticated transaction ids, senders, receivers, confirmed rounds and intra-round offsets. Reduce the complete `0x03` event set in deterministic order. Recover each delivery's actual hybrid session, open `0x06` action 5, match group/mailbox, then authorize its cited event and chain sender/recipient before storing the epoch key. For `0x07`, select the room's historical state/key, check the actual sender's membership, open with replay state scoped by group and sender, and atomically record acceptance only after all checks succeed. Counter allocation, key rotation/distribution, nonce uniqueness and persistent storage are application responsibilities.

Shared-key fixtures are useful for codec tests but do not test a recipient deriving that key from the posted handshake. End-to-end tests must exercise discovery or an explicit trusted key binding, both session recovery paths, authorized key delivery and message opening, with wrong-recipient, wrong-session, stale-parent, removed-member and replay negative cases. Do not infer such coverage from a fixture-only pass.
