---
change: python-agent-core-for-a-self-hosted-bot
artifact: research
---

# Research

The Algorand 25-word mnemonic packs the 32-byte seed as 11-bit little-endian words from the BIP-39 English list, then adds a checksum word from the first 11 bits of SHA-512/256 of the seed. The bundled list matches the one shipped in `py-algorand-sdk` (SHA-256 `2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda`). The address is base32 of the public key plus the last 4 bytes of its SHA-512/256, without padding. `AlgoChat.from_seed` already derives the chat keys from the same seed.
