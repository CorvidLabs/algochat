---
change: python-bot-replies-by-the-room-record-mode-rate-limit-mentions-never-another-bot-declared-slash-commands
artifact: tasks
---

# Tasks

- [x] `py/src/algochat/agent/policy.py`.
- [x] Post times and message fields in `py/src/algochat/agent/rooms.py`; `skipped` in `direct.py`; the policy, `name`, `commands` and `declare_commands` in `core.py`; exports in `agent/__init__.py`.
- [x] Unit tests: `py/tests/test_agent_policy.py`; `py/tests/test_agent_rooms.py` sets every-message mode where it tests reading, not policy.
- [x] Localnet: `py/tests/test_agent_policy_localnet.py`; `py/tests/test_agent_rooms_localnet.py` names its bot and compares bot settings; `swift/Tests/AlgoChatTests/AgentRoomsLocalnetTests.swift` checks bot settings.
- [x] Module specs, README, localnet how-to.
