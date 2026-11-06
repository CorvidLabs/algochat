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

## Local evidence (macOS arm64, 2026-11-06)

- Test first: at `73020ea` the new tests failed before the vectors existed.
  - `cargo test --locked --test pq_conversation` (0 passed, 3 failed) and `--test psk_kept` (0 passed, 3 failed) each panicked on the missing `rs/vectors/` file. The message names the copy command.
  - `cargo test --locked --test conformance`: 7 passed, 1 failed (`every_vector_file_is_present`).
  - `bun test src/pq/conversation.test.ts` and `bun test src/psk/kept.test.ts` each failed with `vectors/<file> is missing ...; write it with: cd ts && bun scripts/emit-conversation-vectors.ts && cp ../vectors/<file> ../rs/vectors/`.
- Emitter and vectors at `d087294`, docs at `09f3c5a`. At `8f62281` `rs/tests/psk_kept.rs` counts a counter as valid only on `Ok(true)`.
- The emitter wrote identical bytes in three separate runs: the two spike runs and the run that wrote the committed files. `rs/vectors/` holds byte copies. No file under `rs/src` or `ts/src` outside the two new tests changed (`git diff b867cf8 HEAD -- rs/src ts/src`).
- In the worktree at `8f62281`:
  - `cargo test --locked` in `rs/`: 258 unit, 8 conformance, 4 known-answer, 3 `pq_conversation` and 3 `psk_kept` tests passed.
  - `cargo fmt --check` and `cargo clippy --locked --all-targets -- -D warnings` were clean.
  - `bun test` in `ts/`: 321 pass, 0 fail. `tsc --noEmit` was clean.
  - An earlier `bun test` run, made while a clean-clone qualification was also running, timed out once in the existing `group-admin.test.ts` 256-member test (5000 ms). The rerun passed with that timeout unchanged.
  - `python3 -m unittest discover -s scripts/release`: 40 tests OK. `fledge lanes run verify` passed (2 steps).
  - `fledge trust verify`: `augur gate · proceed (risk 35)` and `trust gate passed (progressive provenance)`. Provenance is reported degraded because nothing is attested before review.
- `python3 scripts/release/qualify.py rs OUT` in a clean `git clone --no-local` at `8f62281`: exit 0.
  - `cargo test --locked` in `rs/` and again inside the extracted crate: 258 + 8 + 4 + 3 + 3 passed both times.
  - `cargo package --locked` built `algochat-0.6.0.crate` with 44 members, including `tests/pq_conversation.rs`, `tests/psk_kept.rs` and both vectors. Its sha256 is `4efabe64d2447fbfa280e7b8b1e1e2651f705fe55b64721a8acc54514771fad7`.
  - The consumer ran.
- `python3 scripts/release/qualify.py ts OUT` in the same clean clone: exit 0. `bun test` gave 321 pass and `verify.mjs` gave 85 checks passed, 0 failed.
- Mutations in a scratch clone at `8f62281`: 23 of 23 were caught. Each was reverted with `git checkout`, and the tree was clean afterwards.
  - Each of these failed `cargo test --locked --test pq_conversation --test psk_kept`:
    - one byte of a message note, of a handshake note (ephemeral key) or of a kept note;
    - a session key;
    - a message plaintext or a kept note plaintext;
    - a conversation case result, a kept case result or a receive step result;
    - `state_at_restart` with counter 250 added;
    - a message field renamed;
    - a new top-level field in either file;
    - message 10 removed so one direction has 31;
    - either `rs/vectors/` copy deleted.
  - Library mutations in Rust that each failed:
    - `open_pq_handshake_as_sender` with empty associated data;
    - `accept_pq_handshake` without the key-hash check;
    - `PSK_COUNTER_WINDOW` 201;
    - `record_receive` without pruning;
    - `decrypt_psk_message` deriving at counter 0.
  - Adding one byte to `vectors/pq-conversation-v1.json` or `vectors/psk-kept-v1.json` alone failed that file's TypeScript test, and the message named the regenerate command.

Not run here: the hosted Release qualification matrix, which runs on the PR.
