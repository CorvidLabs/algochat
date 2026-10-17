---
id: state-the-hybrid-sender-wrap-and-announcement-rules-exactly-and-make-rust-and-go-follow-them
state: implementing
type: bug_fix
base_commit: 2e4eca63bdfb2340f6bd4caca34552fea631844d
---

# State the hybrid sender wrap and announcement rules exactly, and make Rust and Go follow them

## Intent

State the hybrid sender wrap and announcement rules exactly, and make Rust and Go follow them

## Affected Canonical Specs

- `protocol`

## Acceptance Criteria

- PROTOCOL.md states the sender wrap KDF, the handshake associated data, and the 0x05 header associated data. The recipient session key still uses both shared secrets. The on-chain sender copy is X25519-only. Rust initiate accepts a recipient X25519 public key and encapsulation key. Rust X25519 discovery returns nothing for an ACPQ note. Go and Rust reject a bad ACPQ signature and accept an unsigned announcement as unverified. A TypeScript test flips ciphertext byte 78. PARITY.md counts 96 notes in rounds 41059 through 41154.

## No-spec Rationale

Not applicable
