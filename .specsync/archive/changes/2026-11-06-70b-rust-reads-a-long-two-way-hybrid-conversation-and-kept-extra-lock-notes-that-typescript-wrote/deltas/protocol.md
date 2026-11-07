## Added

### REQUIREMENT REQ-protocol-13

Rust SHALL read a long two-way Hybrid conversation and kept Extra lock notes that TypeScript wrote. `vectors/pq-conversation-v1.json` and `vectors/psk-kept-v1.json` SHALL be written by `ts/scripts/emit-conversation-vectors.ts` from synthetic seeds and the TypeScript library, never by the Rust code under test, with randomness from a fixed seeded stream inside that script only. The conversation file SHALL hold one `0x04` handshake each way, at least 32 `0x05` messages each way including one at the 4096-byte note ceiling, and accept, sender-recovery and decrypt cases. The kept file SHALL hold version `0x02` notes under one kept secret in both directions at counters including 0, 99, 100, 199, 200 and 4294967295, tamper and wrong-secret cases, and a receive transcript with the counter state at a restart. TypeScript and Rust SHALL check every field, note and case of both files, Rust from its copies in `rs/vectors/`: both accounts SHALL derive every session key from the note and their own seed, both sides SHALL read every message and kept note, and Rust's counter window SHALL give TypeScript's result for every step, also after its state is saved and restored. No library code, public API or wire format SHALL change.

#### Acceptance Criteria

- `cargo test --locked --test pq_conversation --test psk_kept` passes in `rs/` and inside the extracted `.crate`; both sides derive the recorded session keys and read every message and kept note.
- Every handshake, message and kept-note case and every receive step gives the same result in TypeScript and Rust, before and after the restart.
- Changing one byte of a recorded note, one recorded result or the restart state fails the Rust tests; a file that differs from the emitter's output fails the TypeScript test, whose message names the regenerate command.
- A missing vector file fails both languages with the command that restores it.
