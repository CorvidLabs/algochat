---
change: record-algochat-1-6-1-and-py-algochat-0-6-0-in-the-release-instructions-after-algochat-64
artifact: context
---

# Context

algochat#63 found that py-algochat 0.5.0 sent classical `0x01` one-to-one messages. Leif's rule is that AlgoChat and Raven use protocol `0x03` and up only. Draft PR algochat#64 fixes it as AlgoChat 1.6.1 with py-algochat 0.6.0 (Leif on #63, 2026-10-30: "Ac8: idc") and bumps CHANGELOG.md, README.md, py/README.md and py/pyproject.toml. It leaves docs/RELEASE.md, REQ-release-5 and py/docs/run-your-own-bot.md to docs PR #62.

This change only records those versions and the hybrid-only behavior in the docs. It must merge after #64; until #64 merges and `v1.6.1` is tagged, docs/RELEASE.md marks the 1.6.1 rows pending. No protocol, crypto or manifest file changes here.
