---
change: 68-rust-writes-the-acpq-hybrid-key-announcement-byte-for-byte-the-way-typescript-does
artifact: requirements
---

# Requirements

Traceability: CRATE-5 and CRATE-6 in `hi/crate.md` (CRATE-2 and CRATE-3 for the shared vector), algochat#68. The canonical change is in `deltas/protocol.md` (REQ-protocol-12).

- Rust exports `encode_pq_announcement`, which writes the 1189-byte unsigned note or, given the account's Ed25519 signing key, the 1253-byte signed note, byte for byte as TypeScript does (REQ-protocol-12).
- Rust exports `pq_announcement_signing_input`, the 32 bytes the signature signs (REQ-protocol-12).
- Both refuse an encapsulation key that is not 1184 bytes (REQ-protocol-12).
- `vectors/pq-announcement-v1.json` is written by TypeScript from synthetic inputs and covers exact bytes, the signing input, round trips, a wrong signer, a changed key, signature or version, bad note and key lengths, and an unsigned note that stays unverified when a key is given (REQ-protocol-12).
- TypeScript and Rust both check every case from that file; Rust reads its copy in `rs/vectors/`, also from the packaged crate (REQ-protocol-12, REQ-protocol-10).
- `parse_pq_announcement` keeps its behavior, and the wire format does not change (REQ-protocol-12).
