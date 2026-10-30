---
change: room-bots-owner-or-admin-adds-a-bot-with-a-reply-mode-and-rate-limit-and-can-change-them-every-language-reads-the
artifact: context
---

# Context

Issue algochat#42 (tracker #39) asks for the room bot record. Leif confirmed the AGENT family in hi/agent.md on 2026-10-29. This change works only to AGENT-7.a, AGENT-7.b, AGENT-7.d, AGENT-7.e, AGENT-7.f, AGENT-7.g, AGENT-8.a, AGENT-8.b, AGENT-8.e, AGENT-10 and AGENT-10.a. It invents no other acceptance criteria.

Before this change a room record had no way to say that a member is a bot. The delta note from protocol 1.5.0 already names one subject per note, so the bot settings ride on that note.

Constraints: Linux only for this lane. LocalNet only, funded from the LocalNet KMD dispenser; no TestNet, MainNet or real wallets. The Swift pqcross tool refuses to start on Linux (ML-KEM-768 needs macOS 26), so Swift checks the same LocalNet notes through a recorded replay in `swift test`.
