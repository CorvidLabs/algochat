---
id: python-bot-joins-rooms-and-channels-reads-and-replies-and-stops-when-removed-or-it-leaves
state: archived
type: feature
base_commit: 77a8c31ee75ec3e099f7a605c62f21ca168e00ca
---

# Python bot joins rooms and channels, reads and replies, and stops when removed or it leaves

## Intent

Python bot joins rooms and channels, reads and replies, and stops when removed or it leaves

## Affected Canonical Specs

- None

## Acceptance Criteria

- AGENT-6, AGENT-7, AGENT-7.c, AGENT-7.d and AGENT-7.g in hi/agent.md, as scoped by algochat#45: the Python bot joins a room or channel as soon as an owner or admin adds it and an authorized key reaches it, with no request or accept; a key from an account that may not deliver it is ignored; it reads room and channel messages in chain order and replies in plain text with its own account; a message is answered at most once, also after a restart, and nothing from before it joined; after another member is removed it uses the new key; after it is removed it stops in the room and its channels; after it leaves it posts a notice and stays out, also after a restart; room messages written by TypeScript, Go, Rust, Python and Kotlin are read on localnet, and every implementation including Swift (through a recorded-notes swift test on Linux) opens the bot's room notes and reduces the room chains the same way; unit tests use public non-secret seeds and no network; localnet tests use throwaway accounts funded only from the local KMD wallet.

## No-spec Rationale

The protocol spec and vectors do not change. The bot uses the existing section 5.8 handshakes, key deliveries, 0x03 records and 0x07 room messages; leaving is a plain-text room message because the protocol has no self-leave op. This change adds room methods to the Python agent core, with the Python module specs under py/specs updated in place. Wire bytes are untouched.
