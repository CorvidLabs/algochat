---
change: 70b-rust-reads-a-long-two-way-hybrid-conversation-and-kept-extra-lock-notes-that-typescript-wrote
artifact: testing
---

# Testing

Plan:

| Requirement | Check |
| --- | --- |
| REQ-protocol-13 | `bun test src/pq/conversation.test.ts src/psk/kept.test.ts` in `ts/`: each committed file equals the emitter's output (the test runs the regenerate command), and every field, case and receive step holds. `cargo test --locked --test pq_conversation --test psk_kept` in `rs/` and inside the extracted crate: keys and sessions from the seeds on both sides, every message read by both sides, every kept note read by recipient and sender, every case, every receive step across the restart. |
| REQ-protocol-13 (vector mutations) | In a scratch copy, each must fail the Rust tests: one byte of a message note, handshake note or kept note changed; one session key, plaintext, case result or step result changed; `state_at_restart` with a counter added; a field renamed; a new top-level field; a message removed so a direction has 31; each file deleted. Changing either file alone must fail the TypeScript test with the regenerate command in its message. |
| REQ-protocol-13 (library mutations) | Applied in scratch to Rust, each must fail: `open_pq_handshake_as_sender` with empty associated data; `accept_pq_handshake` without the key-hash check; `PSKState` with a window of 201; `record_receive` without pruning; `decrypt_psk_message` reading the counter as 0. |
| REQ-protocol-13 (no regression) | Full `cargo test --locked` in `rs/` (including the conformance tests), full `bun test` and `tsc` in `ts/`. |
| REQ-protocol-10, REQ-release-3 | `python3 -m unittest discover -s scripts/release -v`: the copy check accepts the new `rs/vectors/` files. Clean-clone `qualify.py rs` (fmt, clippy, tests inside the extracted crate) and `qualify.py ts`, each exit 0. |

Repository gates: `fledge lanes run verify`, `specsync change check --commit` and `fledge trust verify`. The hosted Release qualification matrix runs on the PR because `vectors/` changes.

Before the change, the tests must fail at the test-only commit because the vector files are missing (TypeScript reports the regenerate command; Rust names the copy command). Both failures are recorded with that commit.
