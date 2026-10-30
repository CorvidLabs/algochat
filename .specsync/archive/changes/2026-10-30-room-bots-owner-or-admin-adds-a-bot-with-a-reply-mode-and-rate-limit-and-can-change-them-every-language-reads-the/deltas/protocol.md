## Added

### REQUIREMENT REQ-protocol-9

A room's `0x03` record SHALL hold the bot mark, reply mode and rate limit for each bot. Op 13 (add bot) and op 14 (set bot) SHALL be the only ops that carry bot settings, and only as a delta note, as five bytes after the parent group id: mode (1), replies (2, big-endian), seconds (2, big-endian). Only the owner or an admin SHALL add or change a bot. An account SHALL become a bot only through an accepted op 13; nothing the account posts about itself SHALL make it a bot, and a member already in the room SHALL NOT be marked later. A bot SHALL join at once, with no request or accept, and the epoch SHALL stay. Op 13 SHALL authorize a key delivery to its subject only. A bot SHALL NOT be appointed admin and SHALL NOT receive ownership. Reply mode SHALL be 1 (mentions), 2 (every message) or 3 (commands); replies and seconds SHALL each be 1 through 65535. There SHALL be no default mode or limit; 5 replies per 60 seconds is a suggested preset only. A channel SHALL add a bot with its own op 13, only when that account is a bot in the parent room, and SHALL reject a plain add, accept or request for a parent-room bot. TypeScript, Go, Rust, Python, Kotlin and Swift SHALL draft, reduce and check bot records the same way, with the same rejection sentences.

#### Acceptance Criteria

- All six libraries match `vectors/group-admin-bots-v1.json`: drafts byte for byte, draft_errors with the shared sentence, reductions with the same accepted ops, rejection reasons and state, and the delivery and bot lookups.
- `ts/scripts/group-bot-localnet.ts` posts room and channel bot notes on LocalNet; every language reduces the confirmed notes to the same state, bot records and rejection reasons, and the added bot opens the room key from its own session and posts in the room.
- `vectors/group-admin-v1.json` and `vectors/group-admin-delta-v1.json` bytes are unchanged.
