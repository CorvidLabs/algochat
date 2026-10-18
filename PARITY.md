# AlgoChat 1.3.0 parity

One wire format. Six libraries. A language is at parity only when it matches this contract and the bytes in [TEST-VECTORS.md](TEST-VECTORS.md). [PROTOCOL.md](PROTOCOL.md) section 5.7 is normative. If this file and PROTOCOL.md disagree, PROTOCOL.md wins.

`0x01` and `0x02` stay. Identifier `0x03` is not assigned. Do not invent it.

## What 100 percent means

A library is at parity for 1.3.0 when every row below passes in that language, and a note it produces is opened by the TypeScript reference with the same session key.

| Check | Pass |
| --- | --- |
| ML-KEM-768 key from the 32-byte account seed | Same encapsulation key as TypeScript for seed `0x22` * 32 |
| Combiner | Session key `9b393e8cec553ada4821c1fa04b40bf499446b19ca9218fd8dcf8b705e06d734` for the inputs in TEST-VECTORS.md section "1.3 Hybrid session key" |
| Handshake | One note, exactly 2366 bytes, version `0x02`, protocol `0x04` |
| Same key | Sender and recipient derive the same 32-byte session key |
| Sender reopen | The sender opens the session from the note, the long-term X25519 key, and the sender's ML-KEM key. The wrap is not X25519-only |
| Message | Protocol `0x05`, 78-byte header, plaintext max 4002, a 3-byte body is 97 bytes |
| Tamper | One flipped ciphertext byte fails closed |
| Announcement | Magic `ACPQ`, 1184-byte key, optional Ed25519 signature. A bad signature is rejected. An `ACPQ` note is not parsed as an X25519 key |
| Classical | `0x01` and `0x02` vectors in TEST-VECTORS.md still pass |
| Cross | Opens the encapsulation key, ML-KEM ciphertext, shared secret, and combiner in `vectors/pq-mlkem768.json`. A 2366-byte note the library writes is opened by the sender and the recipient |

`handshake_note` and `handshake_bytes` in that file are the withdrawn 1278-byte layout. They are not an acceptance test. The frozen fields are the encapsulation key, the ML-KEM ciphertext, the ML-KEM shared secret, and the combiner. A current handshake is 2366 bytes. The reported LocalNet rounds 41641 through 41736 are the historical cross-library run described below. The driver is `ts/scripts/pq-matrix-localnet.ts`.

## Reported interoperability status (2026-10-17)

| Library | `0x01` `0x02` | `0x04` `0x05` | Combiner vector | Opens other libraries' 2366-byte handshakes | LocalNet mesh |
| --- | --- | --- | --- | --- | --- |
| `ts/` | yes | yes, reference | yes | n/a, it is the reference | yes |
| `swift/` | yes | yes | yes | yes | yes |
| `py/` | yes | yes | yes | yes | yes |
| `rs/` | yes | yes | yes | yes | yes |
| `kt/` | yes | yes | yes | yes | yes |
| `go/` | yes | yes | yes | yes | yes |

The table records the reported runs below; it is not fresh verification of the current checkout or every public API path. No raw receipt tied to an exact commit is committed alongside this record. In particular, low-level hybrid parity does not establish automatic hybrid selection in high-level conversation clients; see [docs/ACCURACY.md](docs/ACCURACY.md).

On 2026-10-17 a size matrix in rounds 41059 through 41154 used a 1278-byte handshake whose sender copy was sealed with X25519 only. That layout is withdrawn.

The current handshake is 2366 bytes. A later LocalNet matrix on the same day, rounds 41641 through 41736, confirmed 96 notes: six 2366-byte handshakes and 90 messages. Every library opened every message from every writer, 540 reads, with no failures. Handshake rounds were TypeScript 41652, Go 41668, Rust 41684, Python 41700, Kotlin 41716, and Swift 41732. TypeScript still writes everyday and Extra lock version `0x02`. The other five write version `0x01`. All six read both. Identifier `0x03` is not used. Swift hybrid sessions use CryptoKit ML-KEM on macOS 26. The Swift workflow does not run on Linux.

An earlier 6x6 mesh, rounds 40924 through 40935, used one small `0x05` body per library. Go and Rust also opened the TypeScript note from rounds 40916 and 40917.

## Engines recorded for the 2026-10-17 run

The test vector decides whether the bytes match. A library that misses the vector is not parity.

| Library | ML-KEM-768 |
| --- | --- |
| TypeScript | `@noble/post-quantum` 0.7.1. No independent audit. |
| Go | `crypto/mlkem` in the Go standard library |
| Rust | `ml-kem` 0.3.3 |
| Python | `cryptography` 50, `MLKEM768PrivateKey.from_seed_bytes` |
| Kotlin | BouncyCastle `bcprov-jdk18on` 1.80 |
| Swift | CryptoKit `MLKEM768` through swift-crypto 3.x. That API needs macOS 26. `swift-algorand` keeps swift-crypto below 4. |

Release qualification must rerun the required checks on the exact candidate commit. This historical table alone does not establish that a tag or registry package is qualified.

## Limits that stay in every port

The session is not forward secret. The recipient's long-term ML-KEM key decapsulates the ML-KEM half of every handshake addressed to it; session recovery also requires the recipient's X25519 secret. The sender copy on the note stays closed unless both the sender's X25519 secret and the sender's ML-KEM secret are available. Falcon authorizes a payment and does not sign the encapsulation key. An unsigned announcement is unverified, the same rule as an unsigned X25519 key. Extra lock (`0x02`) stays its own mode.
