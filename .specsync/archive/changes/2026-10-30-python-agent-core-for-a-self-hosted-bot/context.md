---
change: python-agent-core-for-a-self-hosted-bot
artifact: context
---

# Context

Leif confirmed hi/agent.md on 2026-10-29 (merged as 8e165d5): any agent can use AlgoChat as a bot through one shared core, starting in Python, self-hosted by its operator, with its own wallet, and with its key in an env var or local file on the bot host. algochat#43 covers AGENT-1, AGENT-1.b, AGENT-1.d, AGENT-2 and AGENT-4. Replies, rooms, reply policy, adapters and the funds warning are algochat#44 to #48 and are out of scope here.

Baseline on main before this change: `ruff check src/ tests/` reports 17 errors in existing files, and `specsync check --strict --require-coverage 100 --force` in py/ stops at 95% because `src/algochat/group.py` has no module spec. This change does not touch either.
