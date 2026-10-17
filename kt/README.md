# kt-algochat

[![CI](https://img.shields.io/github/actions/workflow/status/CorvidLabs/kt-algochat/ci.yml?label=CI&branch=main)](https://github.com/CorvidLabs/kt-algochat/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/CorvidLabs/kt-algochat)](https://github.com/CorvidLabs/kt-algochat/blob/main/LICENSE)
[![Version](https://img.shields.io/github/v/release/CorvidLabs/kt-algochat?display_name=tag)](https://github.com/CorvidLabs/kt-algochat/releases)

> **Pre-1.0 Notice**: This library is under active development. The API may change between minor versions until 1.0.

Kotlin implementation of the AlgoChat protocol for encrypted messaging on Algorand.

## Installation

Releases are published to [GitHub Packages](https://github.com/CorvidLabs/kt-algochat/packages).
GitHub Packages requires authentication even for public packages, so you must
configure a GitHub username and a personal access token (with the `read:packages`
scope) and reference the CorvidLabs Maven repository.

Set the credentials as environment variables (or in `~/.gradle/gradle.properties`):

```bash
export GITHUB_ACTOR=your-github-username
export GITHUB_TOKEN=your-personal-access-token
```

### Gradle (Kotlin DSL)

```kotlin
repositories {
    mavenCentral()
    maven {
        url = uri("https://maven.pkg.github.com/CorvidLabs/kt-algochat")
        credentials {
            username = System.getenv("GITHUB_ACTOR")
            password = System.getenv("GITHUB_TOKEN")
        }
    }
}

dependencies {
    implementation("com.corvidlabs:algochat:0.2.0")
}
```

### Gradle (Groovy)

```groovy
repositories {
    mavenCentral()
    maven {
        url = uri("https://maven.pkg.github.com/CorvidLabs/kt-algochat")
        credentials {
            username = System.getenv("GITHUB_ACTOR")
            password = System.getenv("GITHUB_TOKEN")
        }
    }
}

dependencies {
    implementation 'com.corvidlabs:algochat:0.2.0'
}
```


## Quick Start

### Client Initialization

kotlin
import com.corvidlabs.algochat.*

// Configure for LocalNet (development)
val config = AlgoChatConfig.localnet()

// Create client from account seed
val seed = "YOUR_32_BYTE_SEED_HERE".encodeToByteArray()
val address = "YOUR_ALGORAND_ADDRESS"

val algod = AlgodClient("http://localhost:4001", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
val indexer = IndexerClient("http://localhost:8980")
val keyStorage = InMemoryKeyStorage()
val messageCache = InMemoryMessageCache()

val client = AlgoChatClient.fromSeed(
    seed = seed,
    address = address,
    config = config,
    algod = algod,
    indexer = indexer,
    keyStorage = keyStorage,
    messageCache = messageCache
)

// Access your encryption public key (for sharing with contacts)
val myPublicKey = client.encryptionPublicKey


### Network Configuration

kotlin
// LocalNet (development)
val config = AlgoChatConfig.localnet()

// TestNet (testing with real testnet ALGO)
val config = AlgoChatConfig.testnet()

// MainNet (production)
val config = AlgoChatConfig.mainnet()


## Usage

### Sending Messages

kotlin
import com.corvidlabs.algochat.*

// Derive keys from a 32-byte seed (e.g., from Algorand account)
val senderKeys = Keys.deriveKeysFromSeed(seed)
val recipientKeys = Keys.deriveKeysFromSeed(recipientSeed)

// Encrypt a message
val envelope = Crypto.encryptMessage(
    "Hello, World!",
    senderKeys.privateKey,
    senderKeys.publicKey,
    recipientKeys.publicKey
)

// Encode for transmission
val encoded = envelope.encode()


### Receiving Messages

kotlin
// Decode received message
val decoded = ChatEnvelope.decode(encoded)

// Decrypt as recipient
val result = Crypto.decryptMessage(decoded, recipientKeys.privateKey, recipientKeys.publicKey)
result?.let { println(it.text) }


### Key Discovery

Discover a recipient's encryption public key from the blockchain:

kotlin
// Discover key for an address (checks cache first, then indexer)
val discoveredKey = client.discoverKey("RECIPIENT_ADDRESS")

if (discoveredKey != null) {
    println("Found public key: ${discoveredKey.publicKey.toHexString()}")
    println("Verified: ${discoveredKey.isVerified}")
    
    // Now you can encrypt messages to this address
    val encrypted = client.encrypt("Hello!", discoveredKey.publicKey)
} else {
    println("No encryption key found for this address")
}


### Reply Messages with Context

Reply to a specific message with thread context:

kotlin
import com.corvidlabs.algochat.*

val senderKeys = Keys.deriveKeysFromSeed(seed)
val recipientKeys = Keys.deriveKeysFromSeed(recipientSeed)

// Encrypt a reply to a specific transaction
val replyEnvelope = Crypto.encryptReply(
    text = "Yes, I agree with that point!",
    replyToTxid = "ORIGINAL_TX_ID_HERE",
    replyToPreview = "Original message preview...",
    senderPrivateKey = senderKeys.privateKey,
    senderPublicKey = senderKeys.publicKey,
    recipientPublicKey = recipientKeys.publicKey
)

val encoded = replyEnvelope.encode()


### Full Client Workflow

kotlin
import com.corvidlabs.algochat.*

suspend fun chatExample() {
    // Initialize client
    val config = AlgoChatConfig.localnet()
    val client = AlgoChatClient.fromSeed(seed, address, config, algod, indexer)
    
    // Discover recipient's key
    val recipientAddress = "RECIPIENT_ALGORAND_ADDRESS"
    val discoveredKey = client.discoverKey(recipientAddress)
        ?: throw IllegalStateException("Key not found")
    
    // Encrypt and send a message
    val encryptedMessage = client.encrypt("Hello!", discoveredKey.publicKey)
    // Send encryptedMessage via Algorand transaction...
    
    // Decrypt a received message
    val receivedEnvelope: ByteArray = // ... received from network
    val decryptedText = client.decrypt(receivedEnvelope, discoveredKey.publicKey)
    println("Decrypted: $decryptedText")
    
    // Decrypt with full reply context
    val fullContent = client.decryptFull(receivedEnvelope)
    println("Text: ${fullContent.text}")
    fullContent.replyToId?.let { txid ->
        println("This is a reply to transaction: $txid")
    }
    
    // Sync messages from blockchain
    val newMessages = client.sync()
    for (message in newMessages) {
        println("${message.direction}: ${message.content} at ${message.timestamp}")
    }
    
    // Access conversation history
    val conversation = client.conversation(recipientAddress)
    val messages = conversation.messages()
}


## Protocol

AlgoChat uses:
- **X25519** for key agreement
- **ChaCha20-Poly1305** for authenticated encryption
- **HKDF-SHA256** for key derivation

The protocol supports bidirectional decryption, allowing senders to decrypt their own messages.

### PSK v1.1

The PSK (Pre-Shared Key) protocol extends AlgoChat with an additional symmetric key layer:

- **Two-level ratchet** - Session and position keys derived from an initial PSK via HKDF
- **Hybrid encryption** - Combines X25519 ECDH with PSK for dual-layer security
- **Forward secrecy** - Each message uses a unique derived key from the ratchet counter
- **Replay protection** - Sliding counter window prevents message replay attacks

kotlin
import com.corvidlabs.algochat.*

// Create a shared PSK (exchanged out-of-band)
val psk = ByteArray(32) // 32 random bytes shared between peers

// Derive the ratcheted PSK for a specific counter
val counter = 0u
val currentPSK = PSKRatchet.derivePSKAtCounter(psk, counter)

// Encrypt with PSK
val envelope = PSKCrypto.encryptMessage(
    "Hello with PSK!",
    senderKeys.privateKey,
    senderKeys.publicKey,
    recipientKeys.publicKey,
    currentPSK,
    counter
)

// Encode for transmission
val encoded = PSKEnvelopeCodec.encode(envelope)

// Decode and decrypt
val decoded = PSKEnvelopeCodec.decode(encoded)
val result = PSKCrypto.decryptMessage(decoded, recipientKeys.privateKey, recipientKeys.publicKey, currentPSK)
result?.let { println(it.text) }

// Exchange PSKs via URI
val uri = PSKExchangeURI(address = "ALGO_ADDRESS", psk = psk, label = "My Chat")
val uriString = uri.encode() // algochat-psk://v1?addr=...&psk=...&label=...
val parsed = PSKExchangeURI.decode(uriString)


PSK envelope wire format (130-byte header):

[0]       version (0x01)
[1]       protocolId (0x02)
[2..5]    ratchetCounter (4 bytes, big-endian)
[6..37]   senderPublicKey (32 bytes)
[38..69]  ephemeralPublicKey (32 bytes)
[70..81]  nonce (12 bytes)
[82..129] encryptedSenderKey (48 bytes)
[130..]   ciphertext + 16-byte tag


## API Reference

### Core Classes

| Class | Description |
|-------|-------------|
| `AlgoChatClient` | High-level client for encrypted messaging |
| `AlgoChatConfig` | Configuration (network, caching, key discovery) |
| `Keys` | Key derivation and X25519 operations |
| `Crypto` | Message encryption/decryption |
| `PSKCrypto` | PSK-encrypted messaging |
| `ChatEnvelope` | Message envelope structure |
| `DecryptedContent` | Decryption result with optional reply context |

### Key Types

| Type | Description |
|------|-------------|
| `KeyPair` | X25519 key pair (private + public) |
| `DiscoveredKey` | Discovered public key with verification status |
| `Message` | Chat message with metadata |
| `Conversation` | Conversation thread with a participant |
| `ReplyContext` | Reply-to message reference |

### Exceptions

| Exception | When thrown |
|-----------|-------------|
| `AlgoChatException.EncryptionFailed` | Message too large or encryption error |
| `AlgoChatException.DecryptionFailed` | Invalid envelope or decryption error |
| `AlgoChatException.KeyDerivationFailed` | Invalid seed length |
| `AlgoChatException.PublicKeyNotFound` | Recipient key not found on chain |
| `AlgoChatException.InvalidEnvelope` | Bytes are not a valid AlgoChat message |

## Cross-Implementation Compatibility

This implementation is fully compatible with:
- [swift-algochat](https://github.com/CorvidLabs/swift-algochat) (Swift)
- [ts-algochat](https://github.com/CorvidLabs/ts-algochat) (TypeScript)
- [py-algochat](https://github.com/CorvidLabs/py-algochat) (Python)
- [rs-algochat](https://github.com/CorvidLabs/rs-algochat) (Rust)

## License

MIT
