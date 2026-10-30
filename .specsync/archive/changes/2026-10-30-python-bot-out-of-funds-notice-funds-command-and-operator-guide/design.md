---
change: python-bot-out-of-funds-notice-funds-command-and-operator-guide
artifact: design
---

# Design

- `FundsStatus` is a pure value from algod's account info and suggested params; `low` is `spendable < fee_per_reply x 100`.
- The notice goes through the same `_post` as a reply, so it is plain section 5.8 room text every implementation and Raven read, with no protocol change.
- The core keeps `_low_funds_warned` (unknown, false or true). Unknown means "look at the chain": its latest notice since it was last added, in any room, is current unless today's spendable balance plus the fees of every note it sent after that notice reaches the threshold.

Design choices that are not confirmed intent, listed for Leif:

- One reply's worth is the fee of a payment with the largest note (4096 bytes) at the network's minimum fee: 1308 microAlgos at a 1000 minimum fee, so the threshold is 0.1308 Algo above the minimum balance. This warns early rather than late.
- Only the balance above the account's minimum balance counts.
- Notice text: "I'm running low on funds for fees. My operator needs to refill my wallet."
- The check runs after every room post and after one-to-one replies; the notice goes only in a room (the first room post while low, if the drop came from a one-to-one reply).
- The notice is posted even when the room's rate limit is full, and counts toward the limit after.
- Seeing the wallet not low counts as a refill.
- A `funds` command and MCP tool show the wallet; `reply-room` and `serve` report `low_funds_notice`.
- `send_room` refuses the notice text, so only the bot's own check posts it.
- A failed funds check is logged by error type and posts nothing.
