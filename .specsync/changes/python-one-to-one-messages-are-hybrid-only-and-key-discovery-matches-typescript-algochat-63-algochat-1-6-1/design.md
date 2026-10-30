---
change: python-one-to-one-messages-are-hybrid-only-and-key-discovery-matches-typescript-algochat-63-algochat-1-6-1
artifact: design
---

# Design

`HybridDirect` keeps three maps: outbound sessions per peer (with the peer's ML-KEM key hash, so a key change opens a new handshake), inbound sessions by handshake id with their sender, and its own handshakes by id with their receiver. Ingesting a handshake is idempotent. A `0x05` opens only when its handshake's sender is the transaction's sender (or, for its own notes, the receiver matches). `seal` returns the notes to pay; every note passes `require_hybrid_note`. `AgentCore._pay_direct` checks every note before paying any and forgets the session when the handshake payment fails. On first contact `encrypt_hybrid` rebuilds sessions from the chain, oldest first, so a restarted bot keeps its session.

Key discovery follows TypeScript `paginatedKeyDiscovery`: notes sent by the address only, in indexer order; 32/96-byte self-notes are announcements, a verified 96-byte one wins at once, a forged one is skipped, the first unverified candidate (32-byte announcement or `0x01` header key) is the fallback.
