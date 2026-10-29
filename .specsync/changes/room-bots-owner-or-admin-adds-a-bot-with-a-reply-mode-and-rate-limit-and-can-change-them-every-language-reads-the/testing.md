---
change: room-bots-owner-or-admin-adds-a-bot-with-a-reply-mode-and-rate-limit-and-can-change-them-every-language-reads-the
artifact: testing
---

# Testing

Unit and vector tests in every language: `bun test src/pq/` (TypeScript), `go test ./...`, `cargo test`, `pytest tests/test_group_admin.py tests/test_group_admin_bots.py`, `./gradlew test` (Kotlin, GroupAdminBotsTest), `swift test` (GroupAdminBotsTests).

LocalNet: `cd ts && bun scripts/group-bot-localnet.ts` against algod 127.0.0.1:4001 and KMD 4002 (genesis dockernet-v1). Accounts are funded only from the LocalNet KMD dispenser. TypeScript, Go, Rust, Python and Kotlin run as live pqcross tools. Swift's pqcross needs macOS 26, so on Linux the script writes the confirmed notes to a record file and runs `swift test --filter GroupAdminBotsTests` with ALGOCHAT_BOT_LOCALNET_RECORD set. Without that variable the Swift replay test is reported as skipped, never silently passed.

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| REQ-protocol-9 | vectors/group-admin-bots-v1.json passes in all six libraries; ts/scripts/group-bot-localnet.ts passes on LocalNet with every language agreeing on the confirmed notes. |
