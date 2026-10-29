---
module: agent
version: 1
status: active
files:
  - src/algochat/agent/__init__.py
  - src/algochat/agent/account.py
  - src/algochat/agent/config.py
  - src/algochat/agent/core.py

db_tables: []
depends_on: [algochat]
---

# Python AlgoChat Agent Core

## Purpose

Give any agent one shared Python core for a self-hosted AlgoChat bot (AGENT-1, AGENT-1.b, AGENT-1.d). The bot has its own Algorand account (AGENT-2), loaded from a 25-word mnemonic that lives in an environment variable or a local file on the bot host and is never committed (AGENT-4). Later changes add one-to-one replies, rooms, reply policy, and the MCP, CLI and webhook adapters on top of `AgentCore`.

## Public API

`algochat.agent` exports:

| Export | Contract |
|---|---|
| `MNEMONIC_ENV` | `"ALGOCHAT_AGENT_MNEMONIC"`, the environment variable holding the bot's 25-word mnemonic. |
| `MNEMONIC_FILE_ENV` | `"ALGOCHAT_AGENT_MNEMONIC_FILE"`, the environment variable holding the path of a local mnemonic file. |
| `AgentConfigError` | `ValueError` subclass raised when the bot's key is missing, ambiguous, unsafe, or malformed. Its message never contains the mnemonic. |
| `read_mnemonic_file` | Reads a mnemonic from a regular file of at most 4096 bytes with no group or other permission bits; strips surrounding whitespace; rejects an empty file. |
| `load_agent_mnemonic` | Returns the mnemonic from an explicit `path`, else `ALGOCHAT_AGENT_MNEMONIC`, else the file named by `ALGOCHAT_AGENT_MNEMONIC_FILE`. Both variables set, or neither, raises `AgentConfigError`. `environ` defaults to `os.environ`. |
| `mnemonic_to_seed` | Decodes a classic 25-word Algorand mnemonic (BIP-39 English words, 11-bit little-endian packing, SHA-512/256 checksum word) to the 32-byte Ed25519 seed, case- and whitespace-insensitive. |
| `address_from_public_key` | Encodes a 32-byte Ed25519 public key as a 58-character Algorand address with its 4-byte SHA-512/256 checksum. |
| `AgentAccount` | Frozen dataclass of the bot's own `address`, `ed25519_public_key`, and `seed`; `from_mnemonic` and `from_seed` build it. The seed is excluded from `repr` and equality. |
| `AgentCore` | One bot: holds its `AgentAccount` and an `AlgoChat` client bound to that address. `create` and `from_environment` take operator-supplied algod and indexer clients; properties `account`, `address`, `chat`; `repr` shows only the address. |

`src/algochat/agent/wordlist.txt` is the bundled 2048-word BIP-39 English list (SHA-256 `2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda`).

## Invariants

1. A mnemonic decodes to the same seed and address as `py-algorand-sdk`. Wrong word count, unknown words, non-zero padding, or a bad checksum word raise `AgentConfigError`.
2. The mnemonic is read only from the explicit path, the environment, or a local file. Nothing in this module writes it, logs it, or sends it.
3. A mnemonic file with any group or other permission bit is refused (design choice, like `ssh` private keys). Symlinks are followed and the target's mode is checked.
4. `AgentCore` only accepts an `AlgoChat` client whose address is the bot's own address.
5. `AgentCore` makes no network call of its own and has no default endpoint; the operator supplies the algod and indexer clients.
6. The repository `.gitignore` ignores `*.mnemonic` and `.algochat-agent/`.
7. Only Ed25519 accounts are supported in this version.

## Behavioral Examples

```text
Given ALGOCHAT_AGENT_MNEMONIC holds a valid 25-word mnemonic
When AgentCore.from_environment runs with mock algod and indexer clients
Then core.address is that mnemonic's Algorand address and core.chat is bound to it

Given ALGOCHAT_AGENT_MNEMONIC_FILE names a file with mode 644
When the mnemonic is loaded
Then AgentConfigError says to chmod 600 and does not contain any mnemonic word
```

## Error Cases

| Error | When | Behavior |
|---|---|---|
| No source | Neither variable is set and no path is given | Raise `AgentConfigError` naming both variables |
| Ambiguous source | Both variables are set | Raise `AgentConfigError` |
| Unsafe file | Missing, not a regular file, group/other bits set, over 4096 bytes, or empty | Raise `AgentConfigError` without reading or echoing the contents |
| Bad mnemonic | Wrong count, unknown word, bad padding, or checksum mismatch | Raise `AgentConfigError` without echoing the phrase |
| Wrong client | `AgentCore` gets an `AlgoChat` client for another address | Raise `ValueError` |

## Dependencies

- Python 3.10 or newer
- `cryptography` for Ed25519 public key derivation
- The `algochat` module's `AlgoChat`, `AlgoChatConfig`, `AlgodClient`, `IndexerClient`, `EncryptionKeyStorage`, and `MessageCache`

## Change Log

| Version | Date | Changes |
|---|---|---|
| 1 | 2026-10-29 | Agent core: the bot's own account from a 25-word mnemonic in an env var or local file, and `AgentCore` (algochat#43). |
