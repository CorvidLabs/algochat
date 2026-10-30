---
change: python-bot-replies-by-the-room-record-mode-rate-limit-mentions-never-another-bot-declared-slash-commands
artifact: plan
---

# Plan

## Approach

Read the bot's entry in each room's current reduced state every time it serves, and decide per message whether to answer, in a small pure module (`algochat.agent.policy`) that `AgentCore` calls. Count the bot's own posts from the chain so the rate limit holds across restarts. Prove it on localnet with every implementation, the way algochat#44 and algochat#45 did.

## Out of scope

MCP, CLI and webhook adapters (algochat#47), the funds warning and operator guide (algochat#48), a structured command-list note in the protocol, and a reply format for the bot's own room replies.

## Steps

1. `algochat.agent.policy`: section 9 room text, mentions, command calls, the command list, the rate window, name and command checks.
2. `RoomTrack` records the bot's post times; `RoomMessage` gains `reply_to`, `mentioned`, `command` and `from_bot`; `RoomReply` and `DirectReply` gain `skipped`.
3. `AgentCore(name=, commands=, clock=)`, `declare_commands`, and the policy in `serve_rooms` and `serve_direct`. The rate window runs on chain time (newest block time read plus monotonic time since); `clock` is monotonic. `send_room`, `reply_room`, `send_direct` and `reply` read the rooms again and raise `PolicySkip` when the policy rules them out.
4. Unit tests with a fake monotonic clock and the in-memory chain's block time, including a chain clock four hours behind and ahead of the host.
5. Localnet: TypeScript, Go, Rust, Python and Kotlin write messages that drive every mode; an admin and the owner change the mode with op 14; a restart keeps the limit; every tool opens every note and reduces the chain; Swift replays it through `swift test --filter AgentRoomsLocalnetTests`.
6. Module specs, README, localnet how-to.
7. Definition approval, review, verification and finalize are Leif's. They are not recorded by the agent.

## Risks

A host clock far from block time must not change the window, so the bot never compares its wall clock with block times: it uses chain time only, measured forward from the newest block it read with a monotonic clock. Its estimate of "now" can trail the chain by the indexer's delay, which only makes it more conservative. A message skipped for the rate limit is never answered later, by design. A room that marks a person as a bot silences the bot toward that person everywhere.

## Constraints consulted

AGENT-8, AGENT-8.b to AGENT-8.f in hi/agent.md. PROTOCOL.md sections 5.8 (ops 13 and 14, modes, no default mode) and 9. py/AGENTS.md: no SDD approval on a human owner's behalf. `cryptography` stays the only runtime dependency. No real mnemonics, wallets or public-network calls in tests. Leif (Oct 29, 2026): test everything on a local network before any push; local network only, accounts funded from its own KMD wallet. Leif's review of algochat#54 (Oct 29, 2026): one clock for now and past posts, taken from block time; sync again before the skip decision and decide from-bot on that fresh state; `reply_room` refuses what the policy skips and counts against the same window as `send_room`; `send_direct` refuses a known bot before paying; a localnet window that a slow indexer cannot open early.
