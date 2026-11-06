---
change: 70c-1-rust-joins-a-room-over-a-real-hybrid-session-the-way-typescript-does-from-a-shared-vector
artifact: testing
---

# Testing

Plan:

| Requirement | Check |
| --- | --- |
| REQ-protocol-14 | `bun test src/pq/room-session.test.ts` in `ts/`: the committed file equals the emitter's output (the test runs the regenerate command), and every field and case holds. `cargo test --locked --test room_session` in `rs/` and inside the extracted crate: addresses and keys from the seeds, TypeScript's reduced room, each member's session from the handshake and its delivery opened and authorized, every message read once with per-sender replay state, the outsider ignored, and every case. |
| REQ-protocol-14 (vector mutations) | In a scratch copy, each of these must fail the Rust test: one byte of a handshake, delivery, message or administration note changed; the room key changed; a recorded member changed; a message counter changed; a case result changed; a field renamed; a new top-level field; the file deleted. Changing `vectors/room-session-v1.json` alone must fail the TypeScript test with the regenerate command in its message. |
| REQ-protocol-14 (library mutations) | Applied in scratch to Rust, each must fail: `delivery_authorized` without the subject check for an add; `sender_may_post` without the membership check; `open_group_message` ignoring the accepted pairs; `open_group_key_delivery` without the handshake-id check; `derive_group_message_key` without the sender address in its info. |
| REQ-protocol-14 (no regression) | Full `cargo test --locked` in `rs/` (including the conformance tests), full `bun test` and `tsc` in `ts/`, `hi check`. |
| REQ-protocol-10, REQ-release-3 | `python3 -m unittest discover -s scripts/release -v`: the copy check accepts the new `rs/vectors/` file. Clean-clone `qualify.py rs` (tests inside the extracted crate) and `qualify.py ts`, each exit 0. |

Repository gates: `fledge lanes run verify`, `specsync change check --commit` and `fledge trust verify`. The hosted Release qualification matrix and CodeQL run on the PR, and CodeQL must report no new alert.

Before the change, the tests must fail at the test-only commit because the vector file is missing. TypeScript reports the regenerate command, and Rust names the copy command. Both failures are recorded with that commit.
