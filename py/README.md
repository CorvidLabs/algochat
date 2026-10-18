# py-algochat

[![CI](https://img.shields.io/github/actions/workflow/status/CorvidLabs/algochat/py.yml?label=CI&branch=main)](https://github.com/CorvidLabs/algochat/actions/workflows/py.yml)
[![License](https://img.shields.io/github/license/CorvidLabs/algochat)](../LICENSE)
[![Source version](https://img.shields.io/badge/source-0.2.0-blue)](pyproject.toml)

> **Pre-1.0 Notice**: This library is under active development. The API may change between minor versions until 1.0.

Python implementation of the AlgoChat protocol for encrypted messaging on Algorand.

## Version and requirements

- Package: `py-algochat` **0.2.0**, implementing protocol **1.3.0**.
- [Declared runtime](pyproject.toml): Python **3.10+**.
- Qualification is configured for **Python 3.12**; Python 3.10 remains unqualified. The repository's qualification scripts separately require Python **3.11+**. See [all language versions and qualification limits](../docs/RELEASE.md#language-and-runtime-versions).

## Installation

The source version is **0.2.0**. PyPI publication requires separate release authorization and publisher configuration; a root protocol tag does not automatically publish this library. Install from the monorepo source:

```bash
pip install "git+https://github.com/CorvidLabs/algochat.git#subdirectory=py"
```

Once published, install from PyPI:

```bash
pip install py-algochat==0.2.0
```

## Usage

```python
import os

from algochat import derive_keys_from_seed, encrypt_message, decrypt_message
from algochat import encode_envelope, decode_envelope

# Fresh demo identities; use the 32-byte seeds from your accounts in an app.
seed_bytes = os.urandom(32)
recipient_seed = os.urandom(32)
sender_private, sender_public = derive_keys_from_seed(seed_bytes)
recipient_private, recipient_public = derive_keys_from_seed(recipient_seed)

# Encrypt a message
envelope = encrypt_message(
    "Hello, World!",
    sender_private,
    sender_public,
    recipient_public,
)

# Encode for transmission
encoded = encode_envelope(envelope)

# Decode received message
decoded = decode_envelope(encoded)

# Decrypt as recipient
result = decrypt_message(decoded, recipient_private, recipient_public)
print(result.text)  # "Hello, World!"
```

## Encrypted Key Storage

Private encryption keys can be persisted to disk with at-rest encryption using
`FileKeyStorage`. Keys are encrypted with AES-256-GCM using a key derived from a
password via PBKDF2-HMAC-SHA256 (100,000 iterations) and written to
`~/.algochat/keys/<address>.key` with `0600` permissions. The on-disk format
(`salt | nonce | ciphertext | tag`, 92 bytes) interoperates with the Rust
implementation.

```python
from algochat import FileKeyStorage

storage = FileKeyStorage(password="a strong passphrase")
await storage.store(private_key_bytes, address)
recovered = await storage.retrieve(address)
```

For tests and ephemeral use, `InMemoryKeyStorage` stores keys unencrypted in
memory and is not suitable for production.

## Protocol

AlgoChat uses:
- **X25519** for key agreement
- **ChaCha20-Poly1305** for authenticated encryption
- **HKDF-SHA256** for key derivation

The protocol supports bidirectional decryption, allowing senders to decrypt their own messages.

## PSK v1.1 Protocol

The PSK (Pre-Shared Key) v1.1 protocol adds a shared secret layer on top of the standard X25519 key agreement. The two-level schedule derives keys from the initial secret. It does not provide forward secrecy.

```python
import os

from algochat import (
    derive_keys_from_seed,
    derive_psk_at_counter,
    encrypt_psk_message,
    decrypt_psk_message,
    encode_psk_envelope,
    decode_psk_envelope,
    is_psk_message,
    PSKState,
    advance_send_counter,
    validate_counter,
    record_receive,
    create_psk_exchange_uri,
    parse_psk_exchange_uri,
)

# Fresh demo identities; retain your real account seeds securely.
sender_seed = os.urandom(32)
recipient_seed = os.urandom(32)
sender_private, sender_public = derive_keys_from_seed(sender_seed)
recipient_private, recipient_public = derive_keys_from_seed(recipient_seed)

# Shared PSK (exchanged out-of-band)
initial_psk = os.urandom(32)

# Manage counter state
state = PSKState()
counter, state = advance_send_counter(state)

# Derive ratcheted PSK for this counter
current_psk = derive_psk_at_counter(initial_psk, counter)

# Encrypt with PSK
envelope = encrypt_psk_message(
    "Hello with PSK!",
    sender_private,
    sender_public,
    recipient_public,
    current_psk,
    counter,
)

# Encode for transmission
encoded = encode_psk_envelope(envelope)
assert is_psk_message(encoded)

# Validate, authenticate, then record only a successful receive.
# Serialize this sequence per peer in an application.
receive_state = PSKState()
decoded = decode_psk_envelope(encoded)
if not validate_counter(receive_state, decoded.ratchet_counter):
    raise ValueError("Replay or counter outside the receive window")
psk_for_counter = derive_psk_at_counter(initial_psk, decoded.ratchet_counter)
text = decrypt_psk_message(decoded, recipient_private, recipient_public, psk_for_counter)
receive_state = record_receive(receive_state, decoded.ratchet_counter)
assert text == "Hello with PSK!"

# Exchange PSK via URI
uri = create_psk_exchange_uri("YOUR_ALGORAND_ADDRESS", initial_psk, label="My Chat")
parsed = parse_psk_exchange_uri(uri)
```

### PSK Ratchet

The ratchet derives unique keys per message using a two-level hierarchy:
- **Session PSK**: Derived from initial PSK + session index (every 100 messages)
- **Position PSK**: Derived from session PSK + position within session

### PSK Counter State

Counter state tracks send/receive counters with replay protection:
- Rejects duplicate counters (replay attacks)
- Accepts counters up to 200 behind the highest seen counter and any future counter
- Prunes old counters automatically

## Hybrid ML-KEM sessions

Protocol 1.3.0 also exports low-level X25519 + ML-KEM-768 session primitives from `algochat.pq`: a 2366-byte handshake (id `0x04`), 78-byte data header (id `0x05`), and ACPQ key announcements. `cryptography>=50` supplies ML-KEM. These sessions require explicit application orchestration; the high-level client does not automatically dispatch them. See the [Python API contract](specs/algochat/algochat.spec.md#hybrid-ml-kem-session-exports).

## Compatibility evidence and limits

The repository tests shared protocol vectors across TypeScript, Swift, Python, Rust, Kotlin, and Go. A passing local suite can skip optional sibling fixtures; it does not establish every runtime or end-to-end client workflow. See the [accuracy and implementation gap ledger](../docs/ACCURACY.md).

## License

MIT
