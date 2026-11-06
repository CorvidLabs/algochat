---
change: 70c-2-rust-follows-a-room-key-change-and-resumes-an-interrupted-key-handout-the-way-typescript-does-from-a-shared
artifact: testing
---

# Testing

Plan:

| Requirement | Check |
| --- | --- |
| REQ-protocol-15 | `bun test src/pq/room-rekey.test.ts` in `ts/`: the committed file equals the emitter's output (the test runs the regenerate command), and every field, list and case holds. `cargo test --locked --test room_rekey` in `rs/` and inside the extracted crate covers: the four states; channel departures; every delivery opened and authorized, with none to the removed member at epoch 2; recipients, first batch, pending and resumed batch equal to TypeScript's, the missed payment resumed first, and the epoch-2 deliveries exactly the landed ones then the resumed ones; every message under its own epoch's key only, from a sender who may post there; and every case. |
| REQ-protocol-15 (vector mutations) | In a scratch copy, each must fail the Rust test: the epoch-2 room key changed; a handout list reordered; the last epoch-2 delivery removed; the channel departures changed; a removal record byte changed; a message epoch changed; a case result changed; the file deleted. Changing `vectors/room-rekey-v1.json` alone must fail the TypeScript test with the regenerate command in its message. |
| REQ-protocol-15 (library mutations) | Applied in scratch to Rust, each must fail: a delivery batch of 17; `pending_key_deliveries` ignoring landed payments; `channel_departures` naming nobody; `sender_may_post` ignoring the epoch; `delivery_authorized` ignoring the epoch. A removal that authorizes its own subject is unobservable (see research) and is not claimed. |
| REQ-protocol-15 (no regression) | Full `cargo test --locked` in `rs/` (including the conformance tests), full `bun test` and `tsc` in `ts/`. |
| REQ-protocol-10, REQ-release-3 | `python3 -m unittest discover -s scripts/release -v`: the copy check accepts the new `rs/vectors/` file. Clean-clone `qualify.py rs` and `qualify.py ts`, each exit 0. |

Repository gates: `fledge lanes run verify`, `specsync change check --commit` and `fledge trust verify`. The hosted Release qualification matrix and CodeQL run on the PR, and CodeQL must report no new alert.

The tests are committed with this definition and must fail there because the vector file is missing. TypeScript reports the regenerate command, and Rust names the copy command. Both failures are recorded with that commit.

## Local evidence (macOS arm64, 2026-11-06)

- Test first: at `fdbb385` the new tests fail because the vector does not exist yet.
  - `cargo test --locked --test room_rekey`: 0 passed, 5 failed. Each panics on the missing `rs/vectors/room-rekey-v1.json`, and the message names the copy command.
  - `cargo test --locked --test conformance`: 7 passed, 1 failed (`every_vector_file_is_present`).
  - `bun test src/pq/room-rekey.test.ts` fails with `vectors/room-rekey-v1.json is missing ...; write it with: cd ts && bun scripts/emit-room-rekey-vector.ts && cp ../vectors/room-rekey-v1.json ../rs/vectors/`.
  - `cargo fmt --check`, `cargo clippy --locked --all-targets -- -D warnings` and `tsc --noEmit` are clean.
- Nothing else is built yet, as directed.
