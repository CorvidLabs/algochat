# py-algochat

[![CI](https://img.shields.io/github/actions/workflow/status/CorvidLabs/algochat/py.yml?label=CI&branch=main)](https://github.com/CorvidLabs/algochat/actions/workflows/py.yml)
[![License](https://img.shields.io/github/license/CorvidLabs/algochat)](../LICENSE)
[![Source version](https://img.shields.io/badge/source-0.4.0-blue)](pyproject.toml)

> **Pre-1.0 Notice**: This library is under active development. The API may change between minor versions until 1.0.

PQ levels are integers 0 through 5 in [PROTOCOL.md section 5.4.2](../PROTOCOL.md#542-pq-levels). Everyday `0x01` is level 0, Extra lock `0x02` is level 1, and hybrid `0x04` and `0x05` are level 3. Room administration `0x03` is public and has no PQ level.

Python implementation of the AlgoChat protocol for encrypted messaging on Algorand.

## Version and requirements

- Package: `py-algochat` **0.4.0**, implementing protocol **1.5.0**.
- [Declared runtime](pyproject.toml): Python **3.10+**.
- Qualification is configured for **Python 3.12**; Python 3.10 remains unqualified. The repository's qualification scripts separately require Python **3.11+**. See [all language versions and qualification limits](../docs/RELEASE.md#language-and-runtime-versions).

## Installation

The source version is **0.4.0**. PyPI publication requires separate release authorization and publisher configuration; a root protocol tag does not automatically publish this library. Install from the monorepo source:

```bash
pip install "git+https://github.com/CorvidLabs/algochat.git#subdirectory=py"
```

Once published, install from PyPI:

```bash
pip install py-algochat==0.4.0
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

## Agent core (bots)

`algochat.agent` is the shared core for a self-hosted AlgoChat bot. The bot has its own Algorand account, loaded from its 25-word mnemonic. Keep that mnemonic on the machine that runs the bot, in one of:

- `ALGOCHAT_AGENT_MNEMONIC`: the mnemonic itself, or
- `ALGOCHAT_AGENT_MNEMONIC_FILE`: the path of a local file that only its owner can read (`chmod 600`), owned by the user that runs the bot (or root), with no POSIX ACL. Any other file is refused.

Set only one of the two; setting both is refused.

Never commit the mnemonic. The repository ignores `*.mnemonic` and `.algochat-agent/`; add the same lines to your bot project's `.gitignore`. You supply the algod and indexer clients, and you fund the bot's own wallet.

```python
from algochat import AlgoChatConfig
from algochat.agent import AgentCore

core = await AgentCore.from_environment(AlgoChatConfig.localnet(), algod, indexer)
print(core.address)  # the bot's own address
```

### One-to-one replies

The bot sends with its own account; no separate wallet tool is needed. `HttpAlgodClient` and `HttpIndexerClient` speak the node and indexer APIs with the standard library. There is no default endpoint: pass yours.

```python
from algochat import AlgoChatConfig, HttpAlgodClient, HttpIndexerClient
from algochat.agent import AgentCore

algod = HttpAlgodClient("http://127.0.0.1:4001", "<algod token>")
indexer = HttpIndexerClient("http://127.0.0.1:8980", "<indexer token>")
core = await AgentCore.from_environment(AlgoChatConfig.localnet(), algod, indexer)
await core.publish_key()  # once; skipped when the same key is already on chain

def answer(message):
    return f"You said: {message.text}"  # return None to stay silent

for result in await core.serve_direct(answer):
    print(result.message.sender, result.reply_txid, result.error)
```

Call `serve_direct` on a timer. Each message is answered once, also after a restart: the bot finds its own earlier replies on chain. Replies use the reply format in PROTOCOL.md section 9.2, so every AlgoChat client shows what they answer. A handler that raises is reported in `result.error` and not retried. Each reply costs the bot one transaction fee.

### Rooms and channels

An owner or admin adds the bot to a room or channel (in Raven, or with any AlgoChat library) and the bot joins as soon as the room key reaches it; it never asks to join. Publish its post-quantum key once so their client can hand it the key:

```python
await core.publish_pq_key()  # once; skipped when the same key is already on chain

for room in await core.sync_rooms():
    print(room.name, room.status, room.is_channel)

def answer(message):
    return f"You said: {message.text}"  # return None to stay silent

for result in await core.serve_rooms(answer):
    print(result.message.mailbox, result.txid, result.error)
```

Call `serve_rooms` on a timer. Replies are plain text, as Raven shows room messages. Each message is answered once, also after a restart, and nothing from before the bot joined is answered. When the owner or an admin removes the bot it stops in that room and in the room's channels. `await core.leave_room(room)` posts a short notice and stops; only an owner or admin can remove the bot and rotate the room key.

### Reply modes, rate limits and commands

The room's owner or admin picks the bot's reply mode and rate limit when adding it, and can change them at any time. The bot reads them from the room's record every time it serves:

- **Mentions**: it answers `@` and its name (or its address), and replies to its own messages.
- **Every message**: it answers everything.
- **Commands**: it posts its command list in the room once, then answers only the commands it declared. `/help` is always declared.

It never answers another bot, and it posts at most the room's limit (for example 5 per 60 seconds) in any window, also after a restart. A message over the limit is skipped, not queued. Give the bot a name and its commands when you build it:

```python
from algochat.agent import AgentCore, BotCommand

core = await AgentCore.from_environment(
    config, algod, indexer,
    name="helper",
    commands=[BotCommand("echo", "Repeat your text")],
)

def answer(message):
    if message.command is not None:  # commands mode, or a /command in another mode
        return f"echo: {message.command.arguments}"
    return f"You said: {message.text}"

for result in await core.serve_rooms(answer):
    print(result.txid, result.skipped)  # skipped says why the bot stayed silent
```

The MCP, CLI, and webhook adapters come in later releases.

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
- Before any receive, accepts unseen counters 0 through 200 and rejects 1000000
- After the highest accepted counter N, accepts unseen counters from max(0, N-200) through min(4294967295, N+200)
- Issuing 4294967295 exhausts sending. The stored counter does not become 0, a later advance fails, and exhaustion stays on the saved state object, including pickle
- Rejects negative, fractional, non-integer, and oversized counters before 4-byte encoding
- Prunes old counters automatically

## Hybrid ML-KEM sessions

Protocol 1.3.0 also exports low-level X25519 + ML-KEM-768 session primitives from `algochat.pq`: a 2366-byte handshake (id `0x04`), 78-byte data header (id `0x05`), and ACPQ key announcements. `cryptography>=50` supplies ML-KEM. These sessions require explicit application orchestration; the high-level client does not automatically dispatch them. See the [Python API contract](specs/algochat/algochat.spec.md#hybrid-ml-kem-session-exports).

## Compatibility evidence and limits

The repository tests shared protocol vectors across TypeScript, Swift, Python, Rust, Kotlin, and Go. A passing local suite can skip optional sibling fixtures; it does not establish every runtime or end-to-end client workflow. See the [accuracy and implementation gap ledger](../docs/ACCURACY.md).

## License

MIT
