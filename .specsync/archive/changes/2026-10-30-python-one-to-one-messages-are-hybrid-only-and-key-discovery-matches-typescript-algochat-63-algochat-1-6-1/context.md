---
change: python-one-to-one-messages-are-hybrid-only-and-key-discovery-matches-typescript-algochat-63-algochat-1-6-1
artifact: context
---

# Context

algochat#63: the Python bot and agent answered one-to-one messages with classical `0x01` envelopes (and `0x02` with a PSK), while Raven and the other clients moved to hybrid `0x04`/`0x05`. `discover_encryption_key` also read any self-note as a key, so a `0x02` PSK self-note shifted by its header was taken as an X25519 key, a forged 96-byte announcement was used unverified, and an account that rekeyed kept its old key.

Leif's decisions (algochat#63 thread, 2026-10-30, relayed at 12:49 MDT): "Ac4: yes", "Ac8: idc", "Just fix this and use the standard omg". AlgoChat and Raven use only protocol `0x03` and up. That amends BASE-3 and ENCRYPT-2 (Q1(b): the plain library send path is hybrid-only and refuses), and key discovery matches TypeScript exactly (Q2).

docs/RELEASE.md and py/docs/run-your-own-bot.md belong to the open docs PR #62 and are not touched here.

`public_contract` is answered `no` for the root canonical specs (protocol, release, godot), which do not change, following the earlier Python bot changes. The py-algochat API does change (`AlgoChat.encrypt` refuses; 0.6.0, breaking); that contract lives in py/specs (algochat v9, agent v8), updated in place. Answering `yes` would need a protocol or release delta, which waits on PROTOCOL.md 5.4.3/5.7 and on #62 (docs/RELEASE.md). Leif decides at approval.
