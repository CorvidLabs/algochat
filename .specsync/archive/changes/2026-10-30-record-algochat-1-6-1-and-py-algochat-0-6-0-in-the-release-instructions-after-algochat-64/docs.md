---
change: record-algochat-1-6-1-and-py-algochat-0-6-0-in-the-release-instructions-after-algochat-64
artifact: docs
---

# Docs

- docs/RELEASE.md: package table names `v1.6.1` (protocol specification 1.6.0) and py-algochat `0.6.0`, marked pending until #64 merges and is tagged; tag text names `v1.6.0` / `go/v0.5.0` on `7d7b280` as the previous release.
- specs/release/requirements.md REQ-release-5: the same versions, via the delta in this change.
- py/docs/run-your-own-bot.md: new "One-to-one messages" section (hybrid only, `0x04` then `0x05`; protocol `0x03` and up; `publish-keys`; signed ML-KEM-768 key; `HybridKeyNotFoundError`).
