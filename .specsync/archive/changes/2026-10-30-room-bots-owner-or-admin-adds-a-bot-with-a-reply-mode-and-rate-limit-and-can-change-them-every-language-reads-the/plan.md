---
change: room-bots-owner-or-admin-adds-a-bot-with-a-reply-mode-and-rate-limit-and-can-change-them-every-language-reads-the
artifact: plan
---

# Plan

## Approach

Add op 13 (add bot) and op 14 (set bot) to `0x03`. They are delta notes with five more bytes after the parent group id. Folding keeps a sorted bot list in room state. Implement the same rules and rejection sentences in all six libraries, pin them in `vectors/group-admin-bots-v1.json`, and prove them on LocalNet with `ts/scripts/group-bot-localnet.ts`.

## Out of scope

The agent core using the record (replying within the rate limit, reply modes) is #45 and #46. Raven does not vendor this branch. No release tag and no package publish.

## Steps

1. Specify ops 13 and 14 in PROTOCOL.md section 5.8.2 and bump the protocol to 1.6.0.
2. Implement them in TypeScript and emit the shared vector.
3. Implement them in Go, Rust, Python, Kotlin and Swift against that vector, and teach each pqcross tool the `bot` and `bots` fields.
4. Run the LocalNet script across all six languages.
5. Leave the SpecSync approve, review, verify and finalize steps to Leif.

## Risks

A reader that does not know ops 13 and 14 rejects those notes as an unknown op, so an older client will not see the bot as a member. Rust's public `RoomState` and `AdminDraft` gain a field, which breaks struct literals in downstream Rust code.

## Constraints consulted

GROUP-1 through GROUP-13 in hi/group.md stay. The delta layout, the 4096-byte limit, the 16-admin cap and the 256-member cap stay. Full-list notes still open. AGENT-7.a, 7.b, 7.d, 7.e, 7.f, 7.g, 8.a, 8.b, 8.e, 10 and 10.a in hi/agent.md.
