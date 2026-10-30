---
change: room-bots-owner-or-admin-adds-a-bot-with-a-reply-mode-and-rate-limit-and-can-change-them-every-language-reads-the
artifact: design
---

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
