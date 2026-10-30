---
change: python-bot-joins-rooms-and-channels-reads-and-replies-and-stops-when-removed-or-it-leaves
artifact: design
---

# Design

- `algochat.agent.rooms` holds the room model: `Room`, `RoomMessage`, `RoomReply`, the status values, `LEAVE_NOTICE`, and an internal per-room tracker that reads a mailbox's 0x03 records and 0x07 messages, reduces the chain (with the parent room's records for a channel), checks key deliveries and opens messages.
- `AgentCore` gains `publish_pq_key`, `sync_rooms`, `read_rooms`, `send_room`, `reply_room`, `serve_rooms` and `leave_room`. The bot's ML-KEM-768 and X25519 keys are derived from its seed, as every implementation does.
- `NoteTransaction.intra_round_offset` is read from the indexer so ordering is (round, intra-round offset, transaction id), as section 5.8 specifies.
- `account.public_key_from_address` decodes an address back to its key, checking the checksum.

Design choices that are not confirmed intent, listed for Leif:

- Join: the bot joins on the first authorized key delivery, with no request or accept (AGENT-7.d). It accepts hybrid handshakes sent to it, and only uses a session opened by the same account that sent the delivery.
- Leave: the protocol has no self-leave op, so the bot posts a plain-text notice and stops. The notice is on chain, so a restarted bot stays out. Only an owner or admin can remove it and rotate the key. Leaving a room also leaves its channels.
- Removal: once the bot is not a member it reports `removed` and posts nothing. A channel inherits `removed` or `left` from its parent room at once.
- Room replies are plain UTF-8 text, as Raven shows room messages. A room reply format is left to algochat#46.
- Restart safety without a state file: messages at or before the later of the bot's join record and its own last post are not answered.
- Counter: one more than the highest counter seen in the epoch from anyone, like Raven.
- A failing handler is reported by error type and not retried, as for one-to-one messages.
- Reply modes in the room record are read and exposed on `Room.bot` but not enforced yet (algochat#46).
