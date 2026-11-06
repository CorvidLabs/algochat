## Added

### REQUIREMENT REQ-protocol-10

Rust SHALL verify every section and case of the TypeScript-generated conformance vectors `ts/conformance/vectors/00-06` and the shared `vectors/*.json` files it uses, reading them from byte-identical copies in `rs/vectors/` that ship in the crate. A missing vector file, a missing or unexpected section, or an unrecognized case SHALL fail the test. No Rust test SHALL return early or skip because a fixture is absent. A case Rust cannot yet check SHALL be named in one pending list with its issue; the only pending case allowed is the 01 mnemonic chain (#73). Vectors SHALL come from the TypeScript generator or the shared vector files, never from the Rust code under test. TypeScript qualification SHALL run `bun conformance/tools/verify.mjs`.

#### Acceptance Criteria

- `rs/tests/conformance.rs` passes in `rs/` and inside the extracted `.crate`; deleting a vector file, removing a section or renaming a negative case makes it fail.
- `rs/tests/cross_impl.rs` has no sibling-directory tests and no test in `rs/` returns on a missing path.
- `qualify.py ts` runs the TypeScript vector verifier and fails when it fails.
