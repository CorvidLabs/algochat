---
change: room-bots-owner-or-admin-adds-a-bot-with-a-reply-mode-and-rate-limit-and-can-change-them-every-language-reads-the
artifact: tasks
---

# Tasks

- [x] Specify ops 13 and 14, the five-byte bot settings, the rules and the rejection sentences in PROTOCOL.md section 5.8.2; protocol 1.6.0.
- [x] TypeScript: draft, encode, decode, reduce, roomBot, delivery authorization, channel checks; emit vectors/group-admin-bots-v1.json.
- [x] Go, Rust, Python, Kotlin, Swift: the same, matching the vector.
- [x] Each pqcross tool reads `bot` and `bots` and writes `bots`.
- [x] ts/scripts/group-bot-localnet.ts on LocalNet, with the Swift replay test.
- [x] Review round 1 (Leif, 2026-10-29): AGENT-7.c in requirements; exact Swift sentences; pinned mode-2 accept and mode 0/4, zero, above-65535 rejects; AGENT-7.b self-post test in all six.
Leif approves, reviews, verifies and finalizes this change. Those steps are his.
