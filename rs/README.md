# rs-algochat

[![CI](https://img.shields.io/github/actions/workflow/status/CorvidLabs/algochat/rs.yml?label=CI&branch=main)](https://github.com/CorvidLabs/algochat/actions/workflows/rs.yml)
[![License](https://img.shields.io/github/license/CorvidLabs/algochat)](../LICENSE)
[![Source version](https://img.shields.io/badge/source-0.4.0-blue)](Cargo.toml)

> **Pre-1.0 Notice**: This library is under active development. The API may change between minor versions until 1.0.

PQ levels are integers 0 through 5 in [PROTOCOL.md section 5.4.2](../PROTOCOL.md#542-pq-levels). Everyday `0x01` is level 0, Extra lock `0x02` is level 1, and hybrid `0x04` and `0x05` are level 3. Room administration `0x03` is public and has no PQ level.

Rust implementation of the AlgoChat protocol for encrypted messaging on Algorand.

## Version and requirements

- Crate: `algochat` **0.4.0**, implementing protocol **1.4.0**.
- [Declared toolchain](Cargo.toml): Rust **1.85+**, edition **2021**.
- `ml-kem` 0.3.3 enables `ctutils` through `hybrid-array` 0.4 and `module-lattice` 0.2. `ctutils` 0.4.3 requires Rust 1.87, so this crate pins `ctutils` 0.4.2. That release declares Rust 1.85 and still builds the current ML-KEM code. An unpinned resolution is not 1.85-compatible.
- Qualification records the runner's Rust compiler version; the declared Rust 1.85 minimum remains unqualified. The source version does not establish crates.io availability. See [all language versions and qualification limits](../docs/RELEASE.md#language-and-runtime-versions).

## Installation

The crate version in `Cargo.toml` is **0.4.0**. This monorepo has no root package, so a git dependency on the repository does not select `rs/Cargo.toml`. Until 0.4.0 is published, depend on a checkout path:

```toml
[dependencies]
algochat = { path = "/path/to/algochat/rs" }
```

The protocol tag does not publish the crate. crates.io still has 0.2.1; use `algochat = "0.4.0"` only after that version is separately published. See the [dated publication evidence](../docs/RELEASE.md).

## Usage

### Client API

The high-level type is `AlgoChat<A, I, S, M>`. Applications supply implementations of the async `AlgodClient` and `IndexerClient` traits; the crate does not include concrete HTTP adapters. This factory can be called from an async runtime with your adapters and the matching account address:

```rust
use algochat::{AlgoChat, AlgoChatConfig, AlgodClient, IndexerClient,
    InMemoryKeyStorage, InMemoryMessageCache, Result};

async fn create_client<A: AlgodClient, I: IndexerClient>(
    seed: &[u8; 32],
    address: &str,
    algod: A,
    indexer: I,
) -> Result<AlgoChat<A, I, InMemoryKeyStorage, InMemoryMessageCache>> {
    AlgoChat::from_seed(
        seed, address, AlgoChatConfig::localnet(), algod, indexer,
        InMemoryKeyStorage::new(), InMemoryMessageCache::new(),
    ).await
}
```

`encrypt` returns encoded bytes, and `decrypt` consumes encoded bytes. `sync` queries the supplied indexer. Encryption alone does not submit a blockchain transaction. Use encrypted file storage when persistence is required; in-memory storage is for ephemeral use.

### Low-Level Crypto

```rust
use algochat::{derive_keys_from_seed, encrypt_message, decrypt_message, ChatEnvelope};

fn main() -> algochat::Result<()> {
    // Fixed seeds are for this demo only; use securely retained account seeds.
    let (sender_private, sender_public) = derive_keys_from_seed(&[0x11; 32])?;
    let (recipient_private, recipient_public) = derive_keys_from_seed(&[0x22; 32])?;
    let envelope = encrypt_message(
        "Hello, World!", &sender_private, &sender_public, &recipient_public,
    )?;
    let encoded = envelope.encode();
    let decoded = ChatEnvelope::decode(&encoded)?;
    let result = decrypt_message(&decoded, &recipient_private, &recipient_public)?
        .expect("this demo encrypts text, not a key-publication payload");
    assert_eq!(result.text, "Hello, World!");
    Ok(())
}
```

## Protocol

AlgoChat uses:
- **X25519** for key agreement
- **ChaCha20-Poly1305** for authenticated encryption
- **HKDF-SHA256** for key derivation

The protocol supports bidirectional decryption, allowing senders to decrypt their own messages.



## PSK Protocol (v1.1)

The PSK (Pre-Shared Key) protocol extends AlgoChat with an additional layer of symmetric key security:

- **Hybrid encryption**: Combines X25519 ECDH with a pre-shared key
- **Two-level key schedule**: Session and position keys derived from the initial pre-shared key. This is not forward secrecy.
- **Replay protection**: Counter-based state tracking with a fixed 200-position trailing window
- **Exchange URI**: Out-of-band key sharing via `algochat-psk://` URIs
- **Temporary key buffers**: Derived PSK encryption key buffers are zeroized on drop

### PSK Contacts

After constructing a generic `AlgoChat` with your adapters, parse a received URI with `PSKExchangeURI::parse(uri_text)?` and register it with `client.add_psk_contact(&uri.address, &uri.psk, uri.label).await?`. `send_psk(address, text)` returns encoded bytes and a counter; submit the bytes using your transaction integration. `receive_psk(bytes, sender_address)` holds one write lock across validation, decryption, and recording. Two synchronized receives of the same valid ciphertext accept it once. A failed authentication tag does not consume the counter or move the window.

### Low-Level PSK API

Rust takes the **initial** PSK and derives the per-counter PSK internally:

```rust
use algochat::{derive_keys_from_seed, encrypt_psk_message, decrypt_psk_message,
    encode_psk_envelope, decode_psk_envelope, PSKState};

fn main() -> algochat::Result<()> {
    let (sender_private, sender_public) = derive_keys_from_seed(&[0x11; 32])?;
    let (recipient_private, recipient_public) = derive_keys_from_seed(&[0x22; 32])?;
    // Demo material only; exchange a CSPRNG-generated 32-byte PSK in an app.
    let initial_psk = [0xAA; 32];
    let mut send_state = PSKState::new();
    let mut receive_state = PSKState::new();
    let counter = send_state.advance_send_counter()?;
    let envelope = encrypt_psk_message(
        "Hello with PSK!", &sender_private, &sender_public, &recipient_public,
        &initial_psk, counter,
    )?;
    let encoded = encode_psk_envelope(&envelope);
    let decoded = decode_psk_envelope(&encoded)?;
    receive_state.validate_counter(decoded.ratchet_counter)?;
    let text = decrypt_psk_message(
        &decoded, &recipient_private, &recipient_public, &initial_psk,
    )?;
    receive_state.record_receive(decoded.ratchet_counter);
    assert_eq!(text, "Hello with PSK!");
    Ok(())
}
```

Issuing `u32::MAX` marks send state exhausted. The stored counter stays at `u32::MAX` and does not become 0, including after serde. A later advance fails and leaves that state unchanged. Before any receive, only unseen counters 0 through 200 are accepted. After the highest accepted counter `N`, the window is `max(0, N-200)` through `min(u32::MAX, N+200)`. Accepting `u32::MAX` does not make 0 acceptable. Applications must persist the state object, including `send_exhausted`.

## Hybrid ML-KEM sessions

Protocol 1.3.0 exports low-level X25519 + ML-KEM-768 sessions from the crate root: a 2366-byte handshake (id `0x04`), 78-byte data header (id `0x05`), and ACPQ announcement parsing. These functions are independent of the standard/PSK high-level client. See the [protocol API contract](specs/protocol/protocol.spec.md#hybrid-ml-kem-session-exports).

## Compatibility evidence and limits

Shared vectors and native tests cover specific standard, PSK, and PQ paths. Optional sibling fixtures can be absent; passing native tests does not establish every client workflow or runtime. See the [accuracy and implementation gap ledger](../docs/ACCURACY.md).

## License

MIT
