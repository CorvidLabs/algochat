---
change: python-bot-out-of-funds-notice-funds-command-and-operator-guide
artifact: research
---

# Research

hi/agent.md AGENT-3 family and AGENT-9. Algorand fees: a payment pays at least the network minimum fee, plus a per-byte charge for large notes as `algochat.types.payment_fee` models it; an account must keep its minimum balance (algod `min-balance`), which it can never spend. algod `/v2/accounts/{addr}` reports `amount` and `min-balance`; `/v2/transactions/params` reports `min-fee`. The indexer lists the bot's own transactions after a round, which is enough to work out a refill without local state.
