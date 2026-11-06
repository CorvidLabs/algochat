---
change: 68-rust-writes-the-acpq-hybrid-key-announcement-byte-for-byte-the-way-typescript-does
artifact: context
---

# Context

Release B (algochat 0.7.0), the #68 row, under the scope Leif approved on 2026-11-05 ("Approve intent + A and B"). It serves CRATE-5: "I can publish my Hybrid key from Rust the same way Raven web does, signed or unsigned, without building the note myself." Raven Slice 1 needs it for Hybrid first contact.

- TypeScript 0.12.0 writes the `ACPQ` note with `encodePQKeyAnnouncement` and exports `pqAnnouncementSigningInput` (`ts/src/pq/announce.ts`). Rust 0.6.0 only reads it: `parse_pq_announcement` in `rs/src/pq.rs`. Raven Desktop can't publish its key without building the note and the signature itself, which CRATE-6 forbids.
- The wire format is already fixed in PROTOCOL.md section 5.7: magic `ACPQ` (4), version `0x01` (1), encapsulation key (1184), optional Ed25519 signature (64). The note is 1189 bytes unsigned and 1253 signed. The signature is over SHA-256 of `AlgoChat-pq-ek-v1`, the version byte and the key. Nothing here changes it.
- No shared vector covers the announcement yet. Rust's only check is a hand-built signed note inside `rs/src/pq.rs` tests.
- #70a (PR #75, not yet merged) adds `rs/vectors/`, byte-identical copies that the release check enforces, and the `SHARED` list in `rs/tests/conformance.rs`. This branch is built on #75's head (`b867cf8`), as the orchestrator agreed, and merges `origin/main` once #75 lands. This change adds its vector through that harness. #73 (25-word phrase) runs in parallel under REQ-protocol-11; this change uses REQ-protocol-12, as the orchestrator assigned.
