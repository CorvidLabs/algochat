# Lesson bundle — room-bots-owner-or-admin-adds-a-bot-with-a-reply-mode-and-rate-limit-and-can-change-them-every-language-reads-the

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Room bots: owner or admin adds a bot with a reply mode and rate limit, and can change them; every language reads the record the same way
- **Kind**: Feature
- **Specs**: protocol
- **Paths**: PROTOCOL.md, TEST-VECTORS.md, README.md, PARITY.md, vectors/group-admin-bots-v1.json, ts/src/pq, ts/scripts, go, rs/src, py/src/algochat, py/tools/pq_io.py, py/tests/test_group_admin_bots.py, kt/src, swift/Sources, swift/Tests/AlgoChatTests/GroupAdminBotsTests.swift, specs/protocol
- **Acceptance**: AGENT-7.a, AGENT-7.b, AGENT-7.c, AGENT-7.d, AGENT-7.e, AGENT-7.f, AGENT-7.g, AGENT-8.a, AGENT-8.b, AGENT-8.e, AGENT-10 and AGENT-10.a in hi/agent.md, as scoped by algochat#42: the room's 0x03 record holds the bot mark, reply mode and rate limit (ops 13 and 14); only the owner or an admin adds or changes a bot; a self-set flag never makes a bot; a bot joins at once with no accept step; removing a bot is an ordinary op 11 removal with a new room key, and the owner drops it from each channel with op 11 (channel departures), with no separate removal op; a bot is never admin; an existing member cannot be marked later; each channel adds a bot with its own record; there is no default mode and the 5-per-minute preset is a suggestion; TypeScript, Go, Rust, Python, Kotlin and Swift read and check that record the same way, proven by vectors/group-admin-bots-v1.json and by ts/scripts/group-bot-localnet.ts on LocalNet.

## Evidence

- Verification commit: `5eee69226756a641e96c57153b1076ee3413b9ce`
- Base commit: `8e165d5a399fd0e5b94fe2998a07f2a43f448328`
- Verified by: `specsync check --spec protocol`

## From the change's context.md

# Context

Issue algochat#42 (tracker #39) asks for the room bot record. Leif confirmed the AGENT family in hi/agent.md on 2026-10-29. This change works only to AGENT-7.a, AGENT-7.b, AGENT-7.d, AGENT-7.e, AGENT-7.f, AGENT-7.g, AGENT-8.a, AGENT-8.b, AGENT-8.e, AGENT-10 and AGENT-10.a. It invents no other acceptance criteria.

Before this change a room record had no way to say that a member is a bot. The delta note from protocol 1.5.0 already names one subject per note, so the bot settings ride on that note.

Constraints: Linux only for this lane. LocalNet only, funded from the LocalNet KMD dispenser; no TestNet, MainNet or real wallets. The Swift pqcross tool refuses to start on Linux (ML-KEM-768 needs macOS 26), so Swift checks the same LocalNet notes through a recorded replay in `swift test`.

## From the change's design.md

# Design

Design choices (Leif may change any of them):

- New ops rather than an add-member variant: op 13 adds a bot, op 14 changes it. An older reader rejects them as unknown ops instead of reading a bot as a plain member.
- Five bytes after the parent group id: mode (1), replies (2, big-endian), seconds (2, big-endian). Only on a delta note. A full-list bot note is rejected, so there is one layout.
- Modes: 1 when mentioned or replied to, 2 every message, 3 its commands. Rate limit is replies per window of seconds, each 1 through 65535. The preset 5 per 60 seconds is a constant a client may offer; a reader never fills it in.
- Op 13 rules: subject is not a member, not the mailbox and not 32 zero bytes. The bot becomes a member, a pending request from it is dropped, and the epoch stays. Delivery authorization covers op 13 for its subject only.
- Op 14 needs the subject to already be a bot. Remove (op 11) drops the bot entry with the membership.
- A bot cannot be appointed admin and cannot receive ownership.
- Channels: op 13 in a channel needs the subject to be a bot in the parent room at that point. A plain add, accept or request in a channel for a parent bot is rejected.
- Decode order: after the parent group id, a bot op reads five bytes (a full-list bot note fails first), then the settings are checked, then trailing bytes and the 4096 limit.
- The rejection sentences are identical in all six libraries so a client can show the same reason everywhere.

## From the change's testing.md

# Testing

Unit and vector tests in every language: `bun test src/pq/` (TypeScript), `go test ./...`, `cargo test`, `pytest tests/test_group_admin.py tests/test_group_admin_bots.py`, `./gradlew test` (Kotlin, GroupAdminBotsTest), `swift test` (GroupAdminBotsTests).

LocalNet: `cd ts && bun scripts/group-bot-localnet.ts` against algod 127.0.0.1:4001 and KMD 4002 (genesis dockernet-v1). Accounts are funded only from the LocalNet KMD dispenser. TypeScript, Go, Rust, Python and Kotlin run as live pqcross tools. Swift's pqcross needs macOS 26, so on Linux the script writes the confirmed notes to a record file and runs `swift test --filter GroupAdminBotsTests` with ALGOCHAT_BOT_LOCALNET_RECORD set. Without that variable the Swift replay test is reported as skipped, never silently passed.

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| REQ-protocol-9 | vectors/group-admin-bots-v1.json passes in all six libraries; ts/scripts/group-bot-localnet.ts passes on LocalNet with every language agreeing on the confirmed notes. |
| AGENT-7.b | `self_posts_are_not_a_bot` in the vector, and one named test in each of the six libraries: a key announcement, a chat note, a plain-text flag, a join request and a self op 13 leave the account an ordinary member with no bot record. |
| AGENT-7.c | `bot_removed`, `parent_bot_removed` and `channel_bot_removed` reductions, `checks.channel_departures`, and one named test in each library: op 11 removes the bot at epoch 2, the bot is a channel departure, and the owner's op 11 on the channel drops it there at a new channel epoch. |
| AGENT-8.a, AGENT-8.b | Pinned draft_errors and reductions for mode 0, mode 4, zero replies, zero seconds and values above 65535 (wide-integer APIs), and accepted mode 2 drafts and reductions. Swift asserts the exact sentences. |

## Where these lessons go

- `specs/protocol/context.md`
