## Added

### REQUIREMENT REQ-protocol-12

Rust SHALL write the `ACPQ` announcement byte for byte as PROTOCOL.md section 5.7 and TypeScript `encodePQKeyAnnouncement` do. `encode_pq_announcement` SHALL return the 1189-byte unsigned note, or, given the account's Ed25519 signing key, the 1253-byte note ending with the signature over the signing input. `pq_announcement_signing_input` SHALL return SHA-256 of `AlgoChat-pq-ek-v1`, the version byte `0x01` and the encapsulation key. Both SHALL refuse an encapsulation key that is not 1184 bytes. `vectors/pq-announcement-v1.json` SHALL be written by `ts/scripts/emit-pq-announcement-vector.ts` from synthetic inputs, never by the Rust code under test, and SHALL record the signing input, the unsigned and signed notes from one account seed, and parse cases for the unsigned note with and without a key, a wrong signer, a changed key, signature or version, bad note lengths, and bad key lengths. TypeScript and Rust SHALL check every field and case of that file, Rust from its copy in `rs/vectors/`. The wire format and the results of `parse_pq_announcement` SHALL NOT change.

#### Acceptance Criteria

- `cargo test --locked --test pq_announcement` passes in `rs/` and inside the extracted `.crate`; the notes from the vector's seed and the signing input equal the vector bytes.
- Every parse case gives the same `unverified`, `verified` or `rejected` result in TypeScript and Rust, and an unsigned note stays unverified when a key is given.
- Changing one byte of a recorded note or the signing input, or one case's result, fails the Rust test; a vector that differs from the emitter's output fails the TypeScript test, whose message names the regenerate command.
- Encoding and the signing input refuse 0-, 1183- and 1185-byte keys in both languages.
