---
change: python-bot-out-of-funds-notice-funds-command-and-operator-guide
artifact: tasks
---

# Tasks

- [x] `py/src/algochat/agent/funds.py`; `core.py` (`check_funds`, notice after room posts, refill check after one-to-one replies); `rooms.py` (`last_text_since_join`, `RoomReply.low_funds_notice`); exports in `agent/__init__.py`.
- [x] `funds` command and notice reporting in `service.py`.
- [x] Unit tests: `py/tests/test_agent_funds.py`; command count in `py/tests/test_agent_adapters.py`.
- [x] Localnet: `py/tests/test_agent_funds_localnet.py`.
- [x] Module specs, `py/docs/operator-guide.md`, README, localnet how-to.
- [x] Leif's review of algochat#56: rebased on the reviewed #49 to #55; the low-funds check after the command list and the leave notice too; crossing tests for both and a rate-window count test.
