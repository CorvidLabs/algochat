---
change: python-one-to-one-messages-are-hybrid-only-and-key-discovery-matches-typescript-algochat-63-algochat-1-6-1
artifact: plan
---

# Plan

## Approach

Add `algochat.hybrid_direct` (session state for one-to-one `0x04`/`0x05` on top of `algochat.pq`), route `AlgoChat` and `AgentCore` one-to-one sends through it, refuse every classical send, reject classical notes in the agent, and rewrite `discover_encryption_key` to follow TypeScript's `paginatedKeyDiscovery`.

## Out of scope

The protocol text and vectors (PROTOCOL.md 5.4.3 and 5.7 still say a sender MAY use `0x01`), the other five libraries, rooms (already hybrid), docs/RELEASE.md and py/docs/run-your-own-bot.md (#62), tags, releases and publishing.

## Steps

1. `hybrid_direct.py`: `HybridDirect`, `HybridPeerKeys`, `discover_pq_encaps_key`, `require_hybrid_note`, errors.
2. `client.py`: `discover_hybrid_keys`, `encrypt_hybrid` with session recovery from the chain, `encrypt` refuses, hybrid reads in `process_transaction`/`sync`.
3. `agent/core.py`: `send_direct`/`reply` hybrid with `_pay_direct`; `_open` rejects non-hybrid notes; chain-order reads.
4. `blockchain.py`: TypeScript discovery, signature checks.
5. Tests, including localnet against TypeScript, Go, Rust and Python tools.
6. py/specs (algochat v9, agent v8), hi/, INTENT.md, README, CHANGELOG 1.6.1, py-algochat 0.6.0.
7. Definition approval, review, verification and finalize are Leif's and are not recorded by the agent.

## Risks

A person whose client has not published a signed ML-KEM-768 key can no longer get a reply from the bot until it does. Old classical messages to the bot go unanswered. `AlgoChat.encrypt` callers break (0.6.0, breaking).

## Constraints consulted

BASE-3, ENCRYPT-2, KEYS-4, AGENT-5 in hi/; Leif's words above; py/AGENTS.md (no SDD approval on a human owner's behalf); local network only, throwaway accounts funded from the local KMD wallet.
