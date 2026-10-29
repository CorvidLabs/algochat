---
change: python-bot-out-of-funds-notice-funds-command-and-operator-guide
artifact: plan
---

# Plan

## Approach

Add `algochat.agent.funds` (`FundsStatus`, the threshold and notice text). After each room post, `AgentCore` reads its balance from algod and posts the notice in the same room when funds are low and no notice is current. A fresh core decides whether its last on-chain notice is still current from today's balance plus the fees it paid since that notice. Prove it on localnet against messages written by every implementation, the way algochat#44 to algochat#47 did.

## Out of scope

Payments and tips, automatic refills, hosted bots, one-to-one notices, and a protocol change.

## Steps

1. `funds.py`: `LOW_FUNDS_REPLIES`, `LOW_FUNDS_NOTICE`, `reply_fee`, `FundsStatus`.
2. `AgentCore.check_funds`, the post-then-notice path for `send_room`, `reply_room` and `serve_rooms`, the refill check after one-to-one replies, `RoomTrack.last_text_since_join`, `RoomReply.low_funds_notice`.
3. `funds` command (CLI and MCP tool); `reply-room` and `serve` report the notice.
4. Unit tests (`py/tests/test_agent_funds.py`), parity count in `test_agent_adapters.py`.
5. Localnet (`py/tests/test_agent_funds_localnet.py`): drop, one notice, no repeat, restart, refill re-arm, separate CLI runs, no amounts, every implementation and Swift replay.
6. Module specs (version 6), `py/docs/operator-guide.md`, README, localnet how-to.
7. Definition approval, review, verification and finalize are Leif's. They are not recorded by the agent.

## Risks

A network whose minimum fee changes between a notice and a restart could make a fresh core misjudge a refill; the effect is at most one extra or one missing notice. The estimate uses the largest note, so the warning comes early rather than late. If the wallet is fully empty the notice itself cannot be sent; the threshold leaves about 100 replies of room so that should not happen in practice.

## Constraints consulted

AGENT-1.d, AGENT-3, AGENT-3.a, AGENT-4 and AGENT-9 in hi/agent.md; AGENT-8 as built in algochat#46 (the notice is plain room text). py/AGENTS.md: no SDD approval on a human owner's behalf. `cryptography` stays the only runtime dependency. No real mnemonics, wallets or public-network calls in tests. Leif (Oct 29, 2026): test everything on a local network before any push; local network only, accounts funded from its own KMD wallet.
