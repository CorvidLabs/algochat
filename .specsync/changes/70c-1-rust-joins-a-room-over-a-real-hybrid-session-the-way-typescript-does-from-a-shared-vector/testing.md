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

## Local evidence (macOS arm64, 2026-11-06)

- Test first: at `a55b170` the new tests failed before the vector existed.
  - `cargo test --locked --test room_session`: 0 passed, 4 failed. Each test panicked on the missing `rs/vectors/room-session-v1.json`, and the message names the copy command.
  - `cargo test --locked --test conformance`: 7 passed, 1 failed (`every_vector_file_is_present`).
  - `bun test src/pq/room-session.test.ts` failed with `vectors/room-session-v1.json is missing ...; write it with: cd ts && bun scripts/emit-room-session-vector.ts && cp ../vectors/room-session-v1.json ../rs/vectors/`.
- Emitter and vector at `420aaf5`, docs at `8decac3`. The emitter wrote the same bytes as the two spike runs.
- The first mutation run (at `8decac3`) caught 15 of 17. Two library mutations passed every test:
  - `delivery_authorized` without the subject check for an add. The only cross-member case offered member_a's add to member_b, who was not yet a member, so the membership check refused it first.
  - `open_group_key_delivery` without the handshake-id check. Every tampered delivery also failed its tag.
- `113b749` added three cases at the end of the case list. The 20 earlier cases and every other byte of the file are unchanged:
  - member_b's add offered to member_a;
  - member_a's add offered to the owner;
  - a delivery sealed with the library under member_a's session key but naming member_b's handshake.
- In the worktree at `113b749`:
  - `cargo test --locked` in `rs/`: 258 unit, 8 conformance, 4 known-answer, 3 + 3 (#70b) and 4 `room_session` tests passed.
  - `cargo fmt --check` and `cargo clippy --locked --all-targets -- -D warnings` were clean.
  - `bun test` in `ts/`: 326 pass, 0 fail. `tsc --noEmit` was clean. `hi check` passed.
  - `python3 -m unittest discover -s scripts/release`: 40 tests OK. `fledge lanes run verify` passed.
  - `fledge trust verify` passed (progressive provenance), with `augur gate · review (risk 44)`. Augur's signals:
    - the new file names match its sensitive category `auth` ("session");
    - single author;
    - two recent commits per file;
    - diff size.

    Review is the scoped implementation review this change already waits for. It is not a block.
- `python3 scripts/release/qualify.py rs OUT` in a clean `git clone --no-local` at `113b749`: exit 0.
  - In `rs/` and again inside the extracted crate: 258 + 8 + 4 + 3 + 3 + 4 passed.
  - `cargo package --locked` built `algochat-0.6.0.crate` with 46 members, including `tests/room_session.rs` and `vectors/room-session-v1.json`. Its sha256 is `46ff8dcbcc0aca51130ec5aa2b998b4d792147de04095b0670293b9fb829c589`.
  - The consumer ran.
- `python3 scripts/release/qualify.py ts OUT` in the same clean clone: exit 0. `bun test` gave 326 pass and `verify.mjs` gave 85 checks passed, 0 failed.
- Mutations in a scratch clone at `113b749`: 17 of 17 caught. Each was reverted with `git checkout`, and the tree was clean afterwards.
  - Each of these failed `cargo test --locked --test room_session`:
    - one byte of a handshake, delivery, message or administration note;
    - the room key;
    - a recorded member;
    - a message counter;
    - a case result;
    - a field renamed;
    - a new top-level field;
    - the `rs/vectors/` copy deleted.
  - Library mutations in Rust that each failed:
    - `delivery_authorized` without the subject check;
    - `sender_may_post` without the membership check;
    - `open_group_message` ignoring the accepted pairs;
    - `open_group_key_delivery` without the handshake-id check;
    - `derive_group_message_key` without the sender address.
  - Adding one byte to `vectors/room-session-v1.json` alone failed the TypeScript test, and the message named the regenerate command.
- `git diff 7e164e4 HEAD -- rs/src ts/src`: only the two new test files. No library code changed.

Not run here: the hosted Release qualification matrix and CodeQL, which run on the PR.
