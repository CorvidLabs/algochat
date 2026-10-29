---
change: python-agent-core-for-a-self-hosted-bot
artifact: design
---

# Design

`algochat.agent` is a subpackage, not part of the root `algochat` exports, leaving room for later cli, mcp and webhook modules.

Design choices that are not confirmed intent, listed for Leif:

- A mnemonic file with any group or other permission bit is refused, like ssh private keys. Following the ssh rule, it must also be owned by the user running the bot or by root, and a file with a POSIX access ACL is refused. The checks run with `fstat` on the opened descriptor and only that descriptor is read, so the file cannot be swapped in between. Symlinks are followed and the target is checked. FIFOs are opened non-blocking and refused as non-regular.
- Both env vars set (non-empty after stripping whitespace) is refused rather than picking one, even when an explicit path is passed.
- The decoder accepts full words and, like `py-algorand-sdk`, unique word prefixes of 4 or more letters (the same word-to-index table). Chosen over narrowing the spec to full words so phrases accepted by algosdk are accepted here too; full words from `goal account export` and wallets still work, and prefixes under 4 letters are refused.
- Names: `ALGOCHAT_AGENT_MNEMONIC`, `ALGOCHAT_AGENT_MNEMONIC_FILE`; ignore patterns `*.mnemonic`, `.algochat-agent/`.
- The mnemonic decoder and word list are bundled instead of depending on `py-algorand-sdk`.
- Ed25519 accounts only.
- `AgentAccount` fields are only `address` and `ed25519_public_key`. The seed is a constructor argument kept in a private redacting holder (not a dataclass field), read through the `seed` property, kept out of `repr`, `str`, `asdict` and `vars`, and pickling is refused. The constructor re-derives the public key and address from the seed and refuses a mismatch, so equal accounts always have the same seed. `AgentCore` also checks the chat client's Ed25519 public key, not only its address.
- Errors never echo the mnemonic, the file bytes, or the seed. Decoding runs in a helper that returns `(seed, error)` instead of raising, and functions clear their phrase, seed and environment locals before raising, so no frame on an `AgentConfigError` traceback holds them. Errors are raised outside `except` blocks where the caught exception could carry file bytes (for example `UnicodeDecodeError`), so the chain is empty.
- `py/scripts/native-localnet.sh` pins a SHA-256 for every download and verifies it before unpacking.
