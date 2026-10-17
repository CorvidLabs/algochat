# Prompt: review AlgoChat protocol 1.3.0

Paste the block below into a new review session. Point the reviewer at the branch `feat/pq-1.3.0` of `https://github.com/CorvidLabs/algochat` (pull request 5), not at `main`.

```
You are reviewing a protocol change. Do not rewrite it. Do not add a feature. Report defects, overclaims, and missing tests. Quote file paths and the bytes or sentences that are wrong.

Repository: https://github.com/CorvidLabs/algochat
Branch: feat/pq-1.3.0
Pull request: https://github.com/CorvidLabs/algochat/pull/5
Tag already on main: v1.2.1. That tag must not contain 0x04 or 0x05. Confirm the new work is not on that tag.

Read, in this order:
1. PARITY.md
2. PROTOCOL.md section 5.7 and the protocol-id table in section 5.4
3. TEST-VECTORS.md section "1.3 Hybrid session key"
4. specs/protocol/protocol.spec.md
5. ts/src/pq/ (types.ts, kdf.ts, kem.ts, session.ts, announce.ts, pq.test.ts)
6. ts/src/blockchain/discovery.ts where ACPQ is rejected
7. implementations.json
8. README.md library table
9. docs/HLD.md opening paragraph

The intended contract:
- Optional hybrid session: X25519 plus ML-KEM-768 (FIPS 203 category 3).
- Protocol 0x04 is one 1278-byte handshake. Protocol 0x05 is a message with a 78-byte header. Maximum 0x05 plaintext is 4002 bytes. A 3-byte body is 97 bytes.
- Session key is HKDF-SHA256. Salt and info both start with the UTF-8 string algochat-pq-v1. IKM is the 32-byte X25519 secret followed by the 32-byte ML-KEM secret. Info then appends ephemeral public key, ML-KEM ciphertext, sender X25519, recipient X25519, and SHA-256 of the encapsulation key.
- Pinned combiner output: 9b393e8cec553ada4821c1fa04b40bf499446b19ca9218fd8dcf8b705e06d734
- Announcement magic is the four bytes ACPQ. It must not be parsed as an X25519 key.
- Identifier 0x03 must not be assigned anywhere in this public repository.
- 0x01 and 0x02 behavior and vectors stay.
- The session is not forward secret.
- @noble/post-quantum 0.7.1 has no independent audit. The docs must not claim one.
- All six libraries implement 0x04 and 0x05. algochat-web does not.
- LocalNet mesh on 2026-10-17: each library wrote one handshake and one message. Algod confirmed those notes in rounds 40924 through 40935. Every library opened every note and recovered the same session key. The driver is ts/scripts/pq-cross-localnet.ts. Plaintext was "cross from" plus the writer name. Go and Rust also opened the earlier TypeScript note from rounds 40916 and 40917.

Check these questions and answer each with pass, fail, or not tested. Cite the file.
1. Do the sizes in PROTOCOL.md match the constants in ts/src/pq/types.ts?
2. Does the KDF code match the salt, IKM, and info in section 5.7, and the pinned hex?
3. Can a recipient and a sender reopen the same session from one handshake note?
4. Does a one-byte ciphertext flip fail closed?
5. Is 0x03 absent from the public protocol identifiers and from the new code?
6. Does parseKeyAnnouncement return undefined for an ACPQ note?
7. Does implementations.json claim 0x04 and 0x05 for the six libraries, and only 0x01 and 0x02 for algochat-web?
8. Does PARITY.md match the code, including LocalNet rounds 40924 through 40935?
9. Does any doc claim an independent audit of @noble/post-quantum, or claim the hybrid session is forward secret?
10. What must be true before a v1.3.0 git tag is honest?

End with a short list of blockers. Do not propose a new protocol. Do not suggest using 0x03.
```
