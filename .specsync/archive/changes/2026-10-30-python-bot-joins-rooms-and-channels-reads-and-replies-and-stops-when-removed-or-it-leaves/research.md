---
change: python-bot-joins-rooms-and-channels-reads-and-replies-and-stops-when-removed-or-it-leaves
artifact: research
---

# Research

PROTOCOL.md section 5.8: records (0x03) and room messages (0x07) go to the room's mailbox; key deliveries (0x06 action 5, 227 bytes) and hybrid handshakes (0x04) go to the member. A delivery cites the accepted record that authorizes it; `delivery_authorized` checks that record's sender, epoch and subject or members. Ordering is (round, intra-round offset, transaction id bytes). Ops 13 and 14 come from algochat#51. Op 11 (remove) is owner or admin only, so there is no self-leave.

Raven (read for compatibility, not changed): room messages are plain UTF-8 text with no reply format; the next counter is the highest seen in the epoch plus one; a member's ML-KEM key is read from a signed ACPQ announcement before a handshake. The indexer returns `intra-round-offset` on each transaction (checked on localnet). Every implementation's `groupRead` and `adminReduce` agree with Python on the localnet room notes and chains, and Swift's `GroupMailbox.openGroupMessage` and `GroupAdmin.reduce` run on Linux, which the recorded-notes replay uses.
