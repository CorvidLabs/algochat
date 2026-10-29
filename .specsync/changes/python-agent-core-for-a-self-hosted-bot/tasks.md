---
change: python-agent-core-for-a-self-hosted-bot
artifact: tasks
---

# Tasks

- [x] Decode the mnemonic to the bot's own account in `py/src/algochat/agent/account.py`.
- [x] Load the mnemonic from env or an owner-only file in `py/src/algochat/agent/config.py`.
- [x] Add `AgentCore` in `py/src/algochat/agent/core.py`.
- [x] Add `py/specs/agent`, the README section, and the ignore patterns.
- [x] Cover it in `py/tests/test_agent.py`.
- [x] Review fixes: fd-based owner, mode and ACL checks before any read; UTF-8 errors without contents; both env vars refused even with a path; no phrase, seed or environment in traceback locals; seed out of dataclass fields and pickles with a seed/field consistency check; algosdk word prefixes; `py-algorand-sdk` as a dev dependency; pinned SHA-256 downloads in the localnet script.
- [x] Run it end to end on a local network: `py/tests/test_agent_localnet.py`, helpers in `py/tests/localnet_support.py`, `py/scripts/native-localnet.sh` for machines without Docker, and `py/docs/localnet-testing.md`.
