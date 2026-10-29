---
spec: agent.spec.md
---

## Tasks

- [x] Decode the bot's 25-word mnemonic to its own account (algochat#43).
- [x] Load the mnemonic from an env var or a local owner-only file; ignore key files in git (algochat#43).
- [x] Add `AgentCore` bound to the bot's own account (algochat#43).
- [x] Localnet integration tests and a Docker-free localnet script (algochat#43).
- [x] Review fixes: fd-based key-file checks (owner, mode, ACL), no secrets in traceback locals or pickles, seed/field consistency, algosdk word prefixes, pinned localnet downloads (algochat#43).
- [x] One-to-one read and reply, with library payments and HTTP clients (algochat#44).
- [x] Rooms, channels, and removal (algochat#45).
- [ ] Reply policy from the room record (algochat#46).
- [ ] MCP server, CLI, and webhook bridge (algochat#47).
- [ ] Out-of-funds warning and operator guide (algochat#48).
