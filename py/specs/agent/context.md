---
spec: agent.spec.md
---

## Context

Leif confirmed on 2026-10-29 (hi/agent.md) that any agent should be able to use AlgoChat as a bot through one shared core that starts in Python, self-hosted by its operator, with its own wallet and a key kept in an env var or local file on the bot host. This module is that core's first slice (algochat#43, tracker algochat#39).

Design choices that are not confirmed intent: refusing mnemonic files with group or other permission bits, refusing to choose when both environment variables are set, the variable names, the `*.mnemonic` and `.algochat-agent/` ignore patterns, and supporting only Ed25519 accounts for now. The mnemonic decoder is vendored so the package keeps `cryptography` as its only runtime dependency.

One-to-one replies (algochat#44, AGENT-5) add sending to the library itself, so a bot answers without a separate wallet tool. Design choices there, not confirmed intent: payments are built and signed in the library with no Algorand SDK; `HttpAlgodClient` and `HttpIndexerClient` use the standard library and have no default endpoint; replies use the section 9.2 reply format so every client can show what is being answered; a restarted bot learns what it already answered from its own replies on chain, with no local state file; notes it cannot open are skipped; a failing handler is reported and not retried, so one bad message cannot make the bot pay fees in a loop; the preview is cut by Python characters (TypeScript cuts by UTF-16 units, which differs only for characters outside the Basic Multilingual Plane).

Rooms and channels (algochat#45, AGENT-6, AGENT-7). Leif confirmed (hi/agent.md) that an owner or admin adds a bot and it joins at once without accepting (AGENT-7.d), that it works in channels as well as rooms (AGENT-7.c), and that it can be removed or leave (AGENT-7.g). Design choices, not confirmed intent: the protocol has no op for a member to remove themselves, so the bot leaves by posting a plain-text notice and stopping, and only an owner or admin can remove it and rotate the key (a protocol leave op would be a separate protocol change); room replies are plain text like Raven, and a room reply format is left to algochat#46; a restarted bot learns what it already answered from its join record and its own last post on chain, with no local state file; the counter follows Raven (highest seen in the epoch plus one); the hybrid session that opens a key delivery must come from the same account that sent it.
