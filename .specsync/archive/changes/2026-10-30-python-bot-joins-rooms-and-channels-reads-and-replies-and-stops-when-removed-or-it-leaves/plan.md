---
change: python-bot-joins-rooms-and-channels-reads-and-replies-and-stops-when-removed-or-it-leaves
artifact: plan
---

# Plan

## Approach

Build rooms on the library's existing section 5.8 code: a per-room tracker that reduces each mailbox's chain, checks key deliveries against it and opens messages, and `AgentCore` methods on top. Prove it on localnet with every implementation, the way algochat#44 did.

## Out of scope

Reply modes and rate limits from the room record (algochat#46), MCP, CLI and webhook adapters (algochat#47), the funds warning and operator guide (algochat#48), and a protocol op for a member to leave by themselves.

## Steps

1. `intra_round_offset` on `NoteTransaction`, read by the HTTP indexer client.
2. `algochat.agent.rooms` and the `AgentCore` room methods, including the signed PQ key publish.
3. Unit tests on the in-memory chain from algochat#44, with an owner side drafted through the library (`tests/room_support.py`).
4. Localnet: a room and a channel with the bot added by op 13; TypeScript, Go, Rust, Python and Kotlin write room messages with their own tools; every tool opens every room note and reduces both chains; Swift replays the same record through `swift test --filter AgentRoomsLocalnetTests`; member removal, leaving, bot removal.
5. Module specs, README, localnet how-to.
6. Definition approval, review, verification and finalize are Leif's. They are not recorded by the agent.

## Risks

Room reading costs one indexer pass per room per sync. A room the bot was handed a forged key for is read once and dropped. Because there is no protocol leave op, a bot that left still holds the room key until an owner or admin removes it.

## Constraints consulted

AGENT-6, AGENT-7, AGENT-7.c, AGENT-7.d, AGENT-7.g in hi/agent.md. PROTOCOL.md section 5.8. py/AGENTS.md: no SDD approval on a human owner's behalf. `cryptography` stays the only runtime dependency. No real mnemonics, wallets or public-network calls in tests. Leif (Oct 29, 2026): test everything on a local network before any push; local network only, accounts funded from its own KMD wallet.
