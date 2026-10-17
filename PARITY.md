# AlgoChat 1.3.0 parity

One wire format. Six libraries. A language is at parity only when it matches this contract and the bytes in [TEST-VECTORS.md](TEST-VECTORS.md). [PROTOCOL.md](PROTOCOL.md) section 5.7 is normative. If this file and PROTOCOL.md disagree, PROTOCOL.md wins.

`0x01` and `0x02` stay. Identifier `0x03` is not assigned. Do not invent it.

## What 100 percent means

A library is at parity for 1.3.0 when every row below passes in that language, and a note it produces is opened by the TypeScript reference with the same session key.

| Check | Pass |
| --- | --- |
| ML-KEM-768 key from the 32-byte account seed | Same encapsulation key as TypeScript for seed `0x22` * 32 |
| Combiner | Session key `9b393e8cec553ada4821c1fa04b40bf499446b19ca9218fd8dcf8b705e06d734` for the inputs in TEST-VECTORS.md section "1.3 Hybrid session key" |
| Handshake | One note, exactly 1278 bytes, version `0x02`, protocol `0x04` |
| Same key | Sender and recipient derive the same 32-byte session key |
| Sender reopen | The sender opens the session from the note and the long-term X25519 key |
| Message | Protocol `0x05`, 78-byte header, plaintext max 4002, a 3-byte body is 97 bytes |
| Tamper | One flipped ciphertext byte fails closed |
| Announcement | Magic `ACPQ`, 1184-byte key, optional Ed25519 signature. A bad signature is rejected. An `ACPQ` note is not parsed as an X25519 key |
| Classical | `0x01` and `0x02` vectors in TEST-VECTORS.md still pass |
| Cross | TypeScript builds a handshake with seeds `0x11` and `0x22` and coins `0x33`. The other library opens that exact note |

The handshake note is not a frozen hex vector. The sender wrap uses a random nonce. The combiner vector is frozen. The cross check uses a note the TypeScript tests can print when `PQ_VECTOR_NOTE=1` is set. Until that fixture file is checked in, parity is not closed.

## Status

| Library | `0x01` `0x02` | `0x04` `0x05` | Combiner vector | Opens a TypeScript handshake |
| --- | --- | --- | --- | --- |
| `ts/` | yes | yes, reference | yes | n/a, it is the reference |
| `swift/` | yes | no | no | no |
| `py/` | yes | no | no | no |
| `rs/` | yes | yes | yes | yes, opens the TypeScript note |
| `kt/` | yes | no | no | no |
| `go/` | yes | yes | yes | yes, opens the TypeScript note |

Go and Rust open the frozen TypeScript handshake note and recover the same session key. Python, Kotlin, and Swift do not yet. The live LocalNet proof was two TypeScript accounts in one process.

## Work left, per language

Each port keeps its own package layout. It adds the same operations the TypeScript module `ts/src/pq` exports:

- Derive the ML-KEM-768 key pair from the account seed.
- Encode and parse an `ACPQ` announcement.
- Build a handshake, accept it, and reopen it as the sender.
- Encrypt and decrypt a `0x05` message.
- Reject `ACPQ` inside the X25519 announcement parser.

ML-KEM comes from that language's library. TypeScript uses `@noble/post-quantum` 0.7.1, which has no independent audit. Swift should use a reviewed implementation that still runs on the package's minimum OS. The test vector decides whether the bytes match. A different library that misses the vector is not parity.

Do not tag `v1.3.0` until the status table is yes across every row.

## Limits that stay in every port

The session is not forward secret. The long-term ML-KEM key opens every handshake sent to that account. Falcon authorizes a payment and does not sign the encapsulation key. An unsigned announcement is unverified, the same rule as an unsigned X25519 key. Extra lock (`0x02`) stays its own mode.
