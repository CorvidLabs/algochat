---
change: python-bot-out-of-funds-notice-funds-command-and-operator-guide
artifact: requirements
---

# Requirements

- AGENT-3: every fee comes out of the bot's own account, which the operator funds; the bot itself sends nothing but zero-amount notes.
- AGENT-3.a: when fewer than about 100 replies' worth of fees remain, the bot posts one short warning in the room where it reached that level, and not again (in any room) until its wallet is refilled; after a refill the next drop warns once more.
- The "warned" state survives a restart and separate CLI runs, with no local state file.
- A failed funds check never blocks a reply.
- AGENT-9: no bot transaction carries an amount.
- AGENT-1.d, AGENT-4: an operator guide covers self-hosting, funding, checking funds and keeping the mnemonic in an env var or owner-only local file that is never committed.
- The CLI and the MCP server keep one tool per command (AGENT-1.e) with the new `funds` command.
- Every implementation reads the notice and reduces the room chains the same way.
- Unit tests use public non-secret seeds and an in-memory chain; localnet tests use throwaway accounts funded only by the local KMD wallet.
