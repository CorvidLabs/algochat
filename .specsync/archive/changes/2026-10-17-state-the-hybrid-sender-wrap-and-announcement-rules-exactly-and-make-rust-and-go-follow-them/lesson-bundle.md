# Lesson bundle — state-the-hybrid-sender-wrap-and-announcement-rules-exactly-and-make-rust-and-go-follow-them

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: State the hybrid sender wrap and announcement rules exactly, and make Rust and Go follow them
- **Kind**: BugFix
- **Specs**: protocol
- **Paths**: PROTOCOL.md, rs/src/pq.rs, rs/src/blockchain.rs, go/pq.go, ts/src/pq/pq.test.ts
- **Acceptance**: PROTOCOL.md states the sender wrap KDF, the handshake associated data, and the 0x05 header associated data. The recipient session key still uses both shared secrets. The on-chain sender copy is X25519-only. Rust initiate accepts a recipient X25519 public key and encapsulation key. Rust X25519 discovery returns nothing for an ACPQ note. Go and Rust reject a bad ACPQ signature and accept an unsigned announcement as unverified. A TypeScript test flips ciphertext byte 78. PARITY.md counts 96 notes in rounds 41059 through 41154.

## Evidence

- Verification commit: `94b2ff94f66cbc4fc5a1b4fe9f65c6813c67349d`
- Base commit: `2e4eca63bdfb2340f6bd4caca34552fea631844d`
- Verified by: `specsync check --spec protocol`

## From the change's context.md

# Context

Two independent reviews of commit 2e4eca6 held the pull request. The sender copy of the hybrid session key was sealed with X25519 alone, so a break of X25519 opened the messages without breaking ML-KEM. Rust also required the recipient account seed to start a handshake, and its X25519 discovery parser treated an ACPQ note as a key.

The wire format is not tagged. The fix changes the handshake before 1.3.0 is frozen. The 1278-byte LocalNet matrix is withdrawn.

## From the change's design.md

# Design

The handshake gains one 1088-byte ML-KEM ciphertext addressed to the sender, after the recipient encapsulation-key hash and before the nonce. The wrap key is HKDF-SHA256:

```
ikm  = X25519(sender, ephemeral) || sender ML-KEM shared secret
salt = ephemeral public
info = "AlgoChatPQ-SenderKey" || sender X25519
```

Associated data for that wrap is the handshake prefix. Associated data for a 0x05 message stays the 78-byte header. The recipient path does not use the sender ciphertext.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| REQ-protocol-1 | TypeScript, Go, Rust, Python, Kotlin, and Swift PQ tests open a 2366-byte handshake on both sides. Opening with the wrong ML-KEM key fails. A flipped 0x05 ciphertext byte fails. |

LocalNet for the new layout has not been run. Do not tag until it has.

## Where these lessons go

- `specs/protocol/context.md`
