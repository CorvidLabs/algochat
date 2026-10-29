---
change: python-bot-replies-by-the-room-record-mode-rate-limit-mentions-never-another-bot-declared-slash-commands
artifact: research
---

# Research

PROTOCOL.md section 5.8 (from algochat#51): op 13 ADD_BOT and op 14 SET_BOT carry mode (1 mentions or replies, 2 every message, 3 commands), replies and seconds; only the owner or an admin may set them; there is no default mode, and 5 per 60 seconds is only a suggested preset; the bot enforces the limit. Section 9: room plaintext may be plain text, `{"text"}` or a 9.2 reply with `replyTo.txid`. Raven (read for compatibility, not changed) shows room text as plain text, so a plain-text command list is readable there. Every implementation's `adminReduce` already returns bot settings; on localnet they agree with Python for both bots, and Swift's `GroupAdmin.reduce` does too in the recorded-notes replay.
