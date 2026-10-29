---
change: python-bot-reads-one-to-one-messages-and-replies-by-itself
artifact: plan
---

# Plan

## Approach

Move transaction sending into the library, then build one-to-one reading and replying on `AgentCore`. Point the algochat#43 localnet helpers at the library so the tests run the code a bot runs. Prove it on localnet with every implementation.

## Steps

1. `algochat.transaction` and `algochat.http_clients`, with algosdk-derived vectors and a loopback-server test.
2. Keep the reply context in `AlgoChat.process_transaction`.
3. `AgentCore` one-to-one methods and `algochat.agent.direct`.
4. Unit tests on an in-memory chain that decodes every signed payment.
5. Localnet: the algochat#43 tests through the library; a new test where TypeScript, Go, Rust, Python and Kotlin write to the bot and all of them, plus Swift through a recorded-notes `swift test`, read the bot's replies; a paging test.
6. Module specs, README, localnet how-to.
7. Definition approval, review, verification and finalize are Leif's. They are not recorded by the agent.

## Risks

A reimplemented transaction encoder: fixed vectors from `py-algorand-sdk` and algod accepting every localnet payment guard it. Reading the full history on first start costs one indexer pass per page.

## Constraints consulted

AGENT-5 in hi/agent.md. py/AGENTS.md: no SDD approval on a human owner's behalf. `cryptography` stays the only runtime dependency. No real mnemonics, wallets or public-network calls in tests. Leif (Oct 29, 2026): test everything on a local network before any push; local network only, accounts funded from its own KMD wallet.
