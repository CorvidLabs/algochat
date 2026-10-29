---
change: python-agent-core-for-a-self-hosted-bot
artifact: testing
---

# Testing

`py/tests/test_agent.py` runs with mocks only and public non-secret seeds (bytes 0 to 31, and 0xA5 repeated). `test_matches_algosdk` cross-checks the decoder against `py-algorand-sdk` when it is installed and is skipped otherwise.

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| AGENT-2 own account | `TestAgentAccount` decodes fixed vectors to seed and address, round-trips the address through the library decoder, and refuses bad count, unknown word, padding and checksum. |
| AGENT-4 env or local file | `TestLoadMnemonic` covers both env vars, explicit path, missing and ambiguous sources, owner-only modes, unsafe modes, directories, empty and oversized files, symlinks, and the ignore patterns. |
| AGENT-1, 1.b, 1.d shared self-hosted core | `TestAgentCore` builds the core from an account, env var and file on mock clients, and refuses a chat client for another address. |
