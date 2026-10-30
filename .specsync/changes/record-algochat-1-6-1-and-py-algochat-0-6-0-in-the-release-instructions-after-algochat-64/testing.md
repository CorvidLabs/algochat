---
change: record-algochat-1-6-1-and-py-algochat-0-6-0-in-the-release-instructions-after-algochat-64
artifact: testing
---

# Testing

Docs only. `python3 -m unittest discover -s scripts/release` passes, `bun scripts/validate.ts` validates the protocol documents, `specsync check` passes, and lychee finds no new broken links in docs/RELEASE.md or py/docs/run-your-own-bot.md. The facts in the bot guide were checked against algochat#64 (`AgentCore.publish_key`, `AgentCore.publish_pq_key`, `publish-keys`, `HybridKeyNotFoundError`, hybrid `0x04`/`0x05` only). The Python suite of #64 passed on a native local network.

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| REQ-release-5 | docs/RELEASE.md names release 1.6.1 with repository tag `v1.6.1` (protocol specification 1.6.0), TypeScript 0.12.0, Python 0.6.0, Rust 0.6.0, Kotlin 0.5.0 and Go `go/v0.5.0` unchanged, with `v1.6.0` and `go/v0.5.0` as the previous release, and marks the 1.6.1 rows pending until algochat#64 merges and is tagged. Python 0.6.0 and the CHANGELOG 1.6.1 section come from #64. No tag, registry token or publish workflow was added. |
