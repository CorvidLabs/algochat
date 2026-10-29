---
spec: agent.spec.md
---

## Context

Leif confirmed on 2026-10-29 (hi/agent.md) that any agent should be able to use AlgoChat as a bot through one shared core that starts in Python, self-hosted by its operator, with its own wallet and a key kept in an env var or local file on the bot host. This module is that core's first slice (algochat#43, tracker algochat#39).

Design choices that are not confirmed intent: refusing mnemonic files with group or other permission bits, refusing to choose when both environment variables are set, the variable names, the `*.mnemonic` and `.algochat-agent/` ignore patterns, and supporting only Ed25519 accounts for now. The mnemonic decoder is vendored so the package keeps `cryptography` as its only runtime dependency.
