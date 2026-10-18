# kt-algochat

[![CI](https://img.shields.io/github/actions/workflow/status/CorvidLabs/algochat/kt.yml?label=CI&branch=main)](https://github.com/CorvidLabs/algochat/actions/workflows/kt.yml)
[![License](https://img.shields.io/github/license/CorvidLabs/algochat)](../LICENSE)
[![Source version](https://img.shields.io/badge/source-0.2.0-blue)](build.gradle.kts)

> **Pre-1.0 Notice**: This library is under active development. The API may change between minor versions until 1.0.

Kotlin implementation of the AlgoChat protocol for encrypted messaging on Algorand.

## Version and requirements

- Artifact: `com.corvidlabs:kt-algochat` **0.2.0**, implementing protocol **1.3.0**.
- [Build configuration](build.gradle.kts): Kotlin JVM/serialization plugins **2.1.20** and a **JDK 17** toolchain.
- [Gradle wrapper 8.11](gradle/wrapper/gradle-wrapper.properties) builds/tests the library. Qualification uses **JDK 17** and **Gradle 8.14** for the external consumer; Android is unqualified. See [all language versions and qualification limits](../docs/RELEASE.md#language-and-runtime-versions).

## Installation

The intended release destination is GitHub Packages for [CorvidLabs/algochat](https://github.com/CorvidLabs/algochat/packages), with coordinate `com.corvidlabs:kt-algochat:0.2.0`. As checked on 2026-10-18, the existing GitHub package entry is still associated with archived `CorvidLabs/kt-algochat`; availability at the monorepo Maven endpoint and equivalence to current source were not verified. See [the dated distribution evidence](../docs/RELEASE.md#package-versions-and-distribution).

To use the current source, clone this monorepo and run `./gradlew publishToMavenLocal` from `kt/`, then use `mavenLocal()` in the consuming project's repositories. This is a local development installation, not a remote publication.

The remote examples below target the intended monorepo registry once the matching artifact is available there.
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
        url = uri("https://maven.pkg.github.com/CorvidLabs/algochat")
        credentials {
            username = System.getenv("GITHUB_ACTOR")
            password = System.getenv("GITHUB_TOKEN")
        }
    }
}

dependencies {
    implementation("com.corvidlabs:kt-algochat:0.2.0")
}
```

### Gradle (Groovy)

```groovy
repositories {
    mavenCentral()
    maven {
        url = uri("https://maven.pkg.github.com/CorvidLabs/algochat")
        credentials {
            username = System.getenv("GITHUB_ACTOR")
            password = System.getenv("GITHUB_TOKEN")
        }
    }
}

dependencies {
    implementation 'com.corvidlabs:kt-algochat:0.2.0'
}
```


## Quick Start

### Low-level encryption and replies

This complete JVM example uses fresh demo seeds. In an application, load the 32-byte account seeds from secure storage.

```kotlin
import com.corvidlabs.algochat.*
import java.security.SecureRandom

fun main() {
    val random = SecureRandom()
    val sender = Keys.deriveKeysFromSeed(ByteArray(32).also(random::nextBytes))
    val recipient = Keys.deriveKeysFromSeed(ByteArray(32).also(random::nextBytes))
    val envelope = Crypto.encryptMessage(
        "Hello, World!", sender.privateKey, sender.publicKey, recipient.publicKey
    )
    val encoded = envelope.encode()
    val decoded = ChatEnvelope.decode(encoded)
    val content = requireNotNull(Crypto.decryptMessage(decoded, recipient.privateKey, recipient.publicKey))
    check(content.text == "Hello, World!")

    val reply = Crypto.encryptReply(
        text = "Yes, I agree!",
        replyToTxid = "ORIGINAL_TX_ID",
        replyToPreview = "Original message preview...",
        senderPrivateKey = sender.privateKey,
        senderPublicKey = sender.publicKey,
        recipientPublicKey = recipient.publicKey
    )
    val replyContent = requireNotNull(Crypto.decryptMessage(reply, recipient.privateKey, recipient.publicKey))
    println(replyContent.replyToId)
}
```

### Client with application-provided network adapters

`AlgodClient` and `IndexerClient` are interfaces. Supply implementations that connect to your network; they cannot be constructed from a URL. Client initialization, discovery, conversations, and sync are suspend functions, so call them from a coroutine.

```kotlin
import com.corvidlabs.algochat.*

suspend fun createClient(
    seed: ByteArray,
    accountAddress: String,
    algod: AlgodClient,
    indexer: IndexerClient
): AlgoChatClient = AlgoChatClient.fromSeed(
    seed = seed, // exactly 32 bytes, from the account
    address = accountAddress, // matching address supplied by the caller
    config = AlgoChatConfig.localnet(),
    algod = algod,
    indexer = indexer,
    keyStorage = InMemoryKeyStorage(), // ephemeral demo storage
    messageCache = InMemoryMessageCache()
)

suspend fun encryptFor(client: AlgoChatClient, recipientAddress: String): ByteArray {
    val key = client.discoverKey(recipientAddress)
        ?: error("No encryption key announced")
    check(key.isVerified) { "Recipient key must be verified for this example" }
    return client.encrypt("Hello!", key.publicKey)
}

suspend fun syncHistory(client: AlgoChatClient, participant: String): List<Message> {
    client.sync()
    return client.conversation(participant).messages // property, not messages()
}
```

`AlgoChatConfig.testnet()` and `.mainnet()` select the other network settings. The host must configure its adapters consistently. `client.encryptionPublicKey` exposes the X25519 public key. `client.encrypt` returns note bytes for your transaction integration; the client has no public `send` method. `client.decryptFull(bytes)` returns text/reply context. The `senderPublicKeyBytes` argument of `client.decrypt(bytes, key)` is currently unused; it does not verify the sender. `processTransaction` separately requires verified discovery for received transactions.

The client accepts the supplied address without deriving or checking it against the seed and asks the key storage to store the encryption key with `requireBiometric=false`. The canonical requirements retain the stronger identity and persistence boundaries; see the [implementation gaps](../docs/ACCURACY.md).

## PSK messages

PSK adds an out-of-band 32-byte secret to the X25519 construction. Session and position derivation form a deterministic key schedule; it does not provide forward secrecy. Python and Kotlin take the **current ratcheted PSK** in low-level encryption, while Rust takes the initial PSK.

```kotlin
import com.corvidlabs.algochat.*
import java.security.SecureRandom

suspend fun pskExample(): String {
    val random = SecureRandom()
    val sender = Keys.deriveKeysFromSeed(ByteArray(32).also(random::nextBytes))
    val recipient = Keys.deriveKeysFromSeed(ByteArray(32).also(random::nextBytes))
    val initialPSK = ByteArray(32).also(random::nextBytes)
    val sending = PSKState(initialPSK, "recipient")
    val receiving = PSKState(initialPSK, "sender")
    val counter = sending.nextSendCounter()
    val envelope = PSKCrypto.encryptMessage(
        "Hello with PSK!", sender.privateKey, sender.publicKey, recipient.publicKey,
        sending.pskAtCounter(counter), counter
    )
    val decoded = PSKEnvelopeCodec.decode(PSKEnvelopeCodec.encode(envelope))
    // One atomic receive operation: validate, decrypt, and record on success.
    return receiving.receive(decoded.ratchetCounter) {
        requireNotNull(PSKCrypto.decryptMessage(
            decoded, recipient.privateKey, recipient.publicKey,
            receiving.pskAtCounter(decoded.ratchetCounter)
        )).text
    }
}
```

`PSKExchangeURI(address, psk, label).encode()` and `PSKExchangeURI.decode(uri)` exchange the secret out of band. The PSK envelope header is 130 bytes, followed by ciphertext and a 16-byte tag; the standard header is 126 bytes. Standard and PSK plaintext maxima are 3954 and 3950 UTF-8 bytes under the 4096-byte note ceiling.

`PSKState.receive` holds its mutex through validation, decryption, and recording. `acceptReceiveCounter` records immediately and must not precede unauthenticated decryption. Current counters wrap as unsigned 32-bit values, and the receive policy accepts any future counter while rejecting repeats and counters behind its trailing window. Persist state and replace the PSK before send-counter exhaustion. The [gap ledger](../docs/ACCURACY.md) distinguishes this behavior from stronger canonical requirements.

## Hybrid ML-KEM sessions

`PQ` and `PQProtocol` provide low-level X25519 + ML-KEM-768 sessions: a 2366-byte handshake (id `0x04`), data messages with a 78-byte header (id `0x05`), and ACPQ announcements. These notes use version byte `0x02`. They require application orchestration; the high-level client processes standard envelopes. The sender history copy requires the sender's ML-KEM secret as well as X25519. See the [complete protocol API](specs/protocol/protocol.spec.md#hybrid-ml-kem-export-index).

## API and verification

The canonical contracts describe [protocol primitives](specs/protocol/protocol.spec.md), [PSK state](specs/psk/psk.spec.md), [client, models, and storage](specs/client/client.spec.md), and [fixture evidence](specs/cross-vectors/cross-vectors.spec.md). Production dependencies are Bouncy Castle, Kotlin coroutines, and Kotlin serialization, as pinned in [the build](build.gradle.kts); no Algorand Java SDK is bundled.

Shared vector tests provide scoped compatibility evidence across the six ports. Kotlin's legacy `CrossImplTest` reads optional `.hex` files and can return without exercising a producer; PQ parity uses the committed `vectors/pq-mlkem768.json`. See the [accuracy and implementation gap ledger](../docs/ACCURACY.md) for current limits.

## License

MIT
