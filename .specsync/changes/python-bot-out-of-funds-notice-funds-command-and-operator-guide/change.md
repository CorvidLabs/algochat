---
id: python-bot-out-of-funds-notice-funds-command-and-operator-guide
state: implementing
type: feature
base_commit: bf386df9960b5c5c1cbc45ac342e543d7d81b821
---

# Python bot out-of-funds notice, funds command and operator guide

## Intent

Python bot out-of-funds notice, funds command and operator guide

## Affected Canonical Specs

- None

## Acceptance Criteria

- AGENT-1.d, AGENT-3, AGENT-3.a, AGENT-4 and AGENT-9 in hi/agent.md, as scoped by algochat#48: the operator self-hosts the bot and funds its own wallet, which pays every fee; when fewer than about 100 replies' worth of fees remain, the bot posts a short out-of-funds warning once, in the room where it reached that level, and not again until its wallet is refilled; the bot sends no payments or tips; an operator guide covers self-hosting, funding and keeping the mnemonic in an env var or local file that is never committed; on localnet the bot's throwaway wallet, funded only from the local KMD wallet, drops below the threshold after a reply in one room, posts exactly one notice there and none in the other room, posts no further notice while low (also after a restart and in separate CLI runs), re-arms after a refill and warns once in the room of the next drop, every bot transaction carries no amount, and every implementation including Swift (through the recorded-notes swift test on Linux) opens the bot's notes and reduces both rooms; unit tests use public non-secret seeds and an in-memory chain only.

## No-spec Rationale

The protocol spec and vectors do not change. The out-of-funds notice is plain section 5.8 room text the core already sends, and the funds check only reads the account from algod. The Python module specs under py/specs are updated in place. Wire bytes are untouched.
