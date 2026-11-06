---
id: 68-rust-writes-the-acpq-hybrid-key-announcement-byte-for-byte-the-way-typescript-does
state: implementing
type: feature
base_commit: b867cf8fe8afaf9e7a4e899f5a58fb6dfd6f7f45
---

# 68: Rust writes the ACPQ Hybrid key announcement byte for byte the way TypeScript does

## Intent

68: Rust writes the ACPQ Hybrid key announcement byte for byte the way TypeScript does

## Affected Canonical Specs

- `protocol`

## Acceptance Criteria

- cargo test --locked passes in rs/ and inside the unpacked algochat .crate, where tests/pq_announcement.rs shows that encode_pq_announcement and pq_announcement_signing_input reproduce the exact 1189-byte unsigned note, 1253-byte signed note and signing input of the TypeScript-generated vectors/pq-announcement-v1.json from its account seed, that every parse case gives the same unverified, verified or rejected result, and that a key that is not 1184 bytes is refused; bun test in ts/ shows the committed vector is exactly what ts/scripts/emit-pq-announcement-vector.ts writes and that every case holds in TypeScript; parse_pq_announcement results and the wire format do not change.

## No-spec Rationale

Not applicable
