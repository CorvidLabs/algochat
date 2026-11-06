---
change: 68-rust-writes-the-acpq-hybrid-key-announcement-byte-for-byte-the-way-typescript-does
artifact: testing
---

# Testing

Plan:

| Requirement | Check |
| --- | --- |
| REQ-protocol-12 | `bun test src/pq/announce.test.ts` in `ts/`: the committed vector equals the emitter's output (the test runs the regenerate command), and every field and case holds. `cargo test --locked --test pq_announcement` in `rs/` and inside the extracted crate: exact notes and signing input from the seed, round trips, every parse case, every bad length. |
| REQ-protocol-12 (mutations) | In a scratch copy, each of these must fail the Rust test: one byte of `signed_note`, `unsigned_note` or `signing_input` changed, one case's `expect` changed, a case field renamed, a new top-level field, and the file deleted. Changing `vectors/pq-announcement-v1.json` alone must fail the TypeScript test with the regenerate command in its message. Applied to the Rust encoder, a dropped version byte and a signature over the unhashed message must each fail. |
| REQ-protocol-12 (no regression) | Full `cargo test --locked` in `rs/` (including `src/pq.rs` `parity_fixture` and the conformance tests), full `bun test` and `tsc` in `ts/`. |
| REQ-protocol-10, REQ-release-3 | `python3 -m unittest discover -s scripts/release -v`: the copy check accepts the new `rs/vectors/` file. Clean-clone `qualify.py rs` (tests inside the extracted crate) and `qualify.py ts`, each exit 0. |

Repository gates: `fledge lanes run verify`, `specsync change check --commit` and `fledge trust verify`. The hosted Release qualification matrix runs on the PR because `vectors/` changes.

Before the change, the tests must fail at the test-only commit: the TypeScript test because the vector file is missing, and the Rust test because `encode_pq_announcement` and `pq_announcement_signing_input` don't exist. Both failures are recorded with that commit.
