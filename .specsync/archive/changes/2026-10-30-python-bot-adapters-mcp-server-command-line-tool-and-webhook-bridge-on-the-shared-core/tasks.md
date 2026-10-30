---
change: python-bot-adapters-mcp-server-command-line-tool-and-webhook-bridge-on-the-shared-core
artifact: tasks
---

# Tasks

- [x] `py/src/algochat/agent/config.py` (`read_owner_only_file`) and `core.py` (`room_skip_reason`, `is_known_bot`).
- [x] `py/src/algochat/agent/webhook.py`, `service.py`, `runtime.py`, `mcp.py`, `cli.py`, `__main__.py`; exports in `agent/__init__.py`; `algochat-agent` in `py/pyproject.toml`.
- [x] Unit tests: `py/tests/test_agent_adapters.py`, `py/tests/webhook_support.py`.
- [x] Localnet: `py/tests/test_agent_adapters_localnet.py`.
- [x] Module specs, README, localnet how-to.
- [x] Leif's review of algochat#55: link-local and metadata hosts refused; URL, bridge and redirect tests with exact texts; `send`, `reply` and `reply-room` through the core's synced refusals with tests on a fresh and a long-lived service; rebased on the hardened owner-only file reader; the localnet test waits for the leave notice on the indexer.
