---
change: python-agent-core-for-a-self-hosted-bot
artifact: design
---

# Design

`algochat.agent` is a subpackage, not part of the root `algochat` exports, leaving room for later cli, mcp and webhook modules.

Design choices that are not confirmed intent, listed for Leif:

- A mnemonic file with any group or other permission bit is refused, like ssh private keys.
- Both env vars set is refused rather than picking one.
- Names: `ALGOCHAT_AGENT_MNEMONIC`, `ALGOCHAT_AGENT_MNEMONIC_FILE`; ignore patterns `*.mnemonic`, `.algochat-agent/`.
- The mnemonic decoder and word list are bundled instead of depending on `py-algorand-sdk`.
- Ed25519 accounts only.
- The seed is kept out of `repr` and equality; errors never echo the mnemonic.
