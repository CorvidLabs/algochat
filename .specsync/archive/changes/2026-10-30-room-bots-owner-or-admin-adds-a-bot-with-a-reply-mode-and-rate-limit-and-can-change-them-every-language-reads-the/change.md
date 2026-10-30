---
id: room-bots-owner-or-admin-adds-a-bot-with-a-reply-mode-and-rate-limit-and-can-change-them-every-language-reads-the
state: archived
type: feature
base_commit: 8e165d5a399fd0e5b94fe2998a07f2a43f448328
---

# Room bots: owner or admin adds a bot with a reply mode and rate limit, and can change them; every language reads the record the same way

## Intent

Room bots: owner or admin adds a bot with a reply mode and rate limit, and can change them; every language reads the record the same way

## Affected Canonical Specs

- `protocol`

## Acceptance Criteria

- AGENT-7.a, AGENT-7.b, AGENT-7.c, AGENT-7.d, AGENT-7.e, AGENT-7.f, AGENT-7.g, AGENT-8.a, AGENT-8.b, AGENT-8.e, AGENT-10 and AGENT-10.a in hi/agent.md, as scoped by algochat#42: the room's 0x03 record holds the bot mark, reply mode and rate limit (ops 13 and 14); only the owner or an admin adds or changes a bot; a self-set flag never makes a bot; a bot joins at once with no accept step; removing a bot is an ordinary op 11 removal with a new room key, and the owner drops it from each channel with op 11 (channel departures), with no separate removal op; a bot is never admin; an existing member cannot be marked later; each channel adds a bot with its own record; there is no default mode and the 5-per-minute preset is a suggestion; TypeScript, Go, Rust, Python, Kotlin and Swift read and check that record the same way, proven by vectors/group-admin-bots-v1.json and by ts/scripts/group-bot-localnet.ts on LocalNet.

## No-spec Rationale

Not applicable
