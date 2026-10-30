---
change: python-bot-reads-one-to-one-messages-and-replies-by-itself
artifact: design
---

# Design

- `algochat.transaction` builds, signs and sends a payment in canonical msgpack with Ed25519 from `cryptography`. No Algorand SDK. Fees use the existing `payment_fee`, errors the existing `TransactionError`.
- `algochat.http_clients` implements `AlgodClient` and `IndexerClient` with the standard library. No default endpoint, http(s) only, tokens never in `repr` or errors.
- `AgentCore` gains `publish_key`, `send_direct`, `read_direct`, `reply` and `serve_direct`. Replies use the section 9.2 payload, which every implementation already parses.
- `AlgoChat.process_transaction` now fills `reply_context` for standard notes.

Design choices that are not confirmed intent, listed for Leif:

- Restart safety without a state file: the bot learns which messages it answered from its own replies on chain (`replyTo.txid`).
- A failing handler is reported by error type and not retried, so one bad message cannot make the bot pay fees in a loop.
- Notes the bot cannot open are skipped silently (logged at debug level by type only).
- `publish_key` skips when the same verified key is already on chain.
- `read_direct` reads the whole history once, then only rounds after its cursor.
- The reply preview is cut by Python characters (80, else 77 and `...`). TypeScript cuts by UTF-16 units; the two differ only for characters outside the Basic Multilingual Plane.
- The bot refuses to message itself.
