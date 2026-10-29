---
spec: agent.spec.md
---

## Requirement Coverage

- `REQ-agent-001`: `tests/test_agent.py::TestAgentAccount`, including `test_matches_algosdk` when `py-algorand-sdk` is installed (skipped otherwise; fixed vectors still run).
- `REQ-agent-002`: `tests/test_agent.py::TestLoadMnemonic`.
- `REQ-agent-003`: `tests/test_agent.py::TestAgentCore`.

All fixtures use public, non-secret seeds. No test calls a network.
