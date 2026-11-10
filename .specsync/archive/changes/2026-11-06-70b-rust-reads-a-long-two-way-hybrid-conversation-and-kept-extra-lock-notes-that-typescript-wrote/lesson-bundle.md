# Lesson bundle: 70b-rust-reads-a-long-two-way-hybrid-conversation-and-kept-extra-lock-notes-that-typescript-wrote

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: 70b: Rust reads a long two-way Hybrid conversation and kept Extra lock notes that TypeScript wrote
- **Kind**: Feature
- **Specs**: protocol
- **Paths**: rs/, vectors/pq-conversation-v1.json, vectors/psk-kept-v1.json, ts/scripts/emit-conversation-vectors.ts, ts/src/pq/conversation.test.ts, ts/src/psk/kept.test.ts, TEST-VECTORS.md
- **Acceptance**: cargo test --locked passes in rs/ and inside the unpacked algochat .crate, where tests/pq_conversation.rs shows that both accounts derive every session key of the TypeScript-written vectors/pq-conversation-v1.json from their seeds alone (recipient accept and sender recovery), that both sides read all 64 0x05 messages, 32 each way including one per direction at the 4096-byte ceiling, and that every handshake and message case gives TypeScript's result; and tests/psk_kept.rs shows that the recipient and the sender read every kept version 0x02 Extra lock note of vectors/psk-kept-v1.json, including counters 0, 99, 100, 199, 200 and 4294967295, that every tamper and wrong-secret case gives TypeScript's result, and that the counter window gives TypeScript's result for every step, including after the state is saved and restored. bun test in ts/ shows both committed files are exactly what ts/scripts/emit-conversation-vectors.ts writes and that every case holds in TypeScript. No library code, public API or wire format changes.

## Evidence

- Verification commit: `c952aaff607de7778d3736097a29c50d3fc4345c`
- Base commit: `b867cf8fe8afaf9e7a4e899f5a58fb6dfd6f7f45`
- Verified by: `specsync check --spec protocol`

## From the change's context.md

# Context

Release B (algochat 0.7.0), the #70b row, under the scope Leif approved on 2026-11-05 ("Approve intent + A and B"). It serves CRATE-2: "A Rust app and Raven web can read each other's messages, and shared test vectors prove that before the crate is released." It covers the first two bullets of algochat#70: a long two-way Hybrid chat, and older `0x02` Extra lock messages with kept secrets.

- No shared vector holds a TypeScript `0x04` handshake or `0x05` message. Rust's Hybrid checks are its own unit tests, `parity_fixture` (the ML-KEM key only) and the LocalNet mesh `ts/scripts/pq-cross-localnet.ts`, which needs LocalNet and six toolchains and is not part of the crate's tests.
- For Extra lock, `ts/conformance/vectors/04-psk-envelope.json` has one captured note at counter 0 and `03-psk-ratchet.json` a 10-step state transcript. No vector has a note at a nonzero counter, a sender reading its own kept note, or counter state carried across a restart.
- #70a (PR #75, not yet merged) adds `rs/vectors/`, byte-identical copies the release check enforces, and the `SHARED` list in `rs/tests/conformance.rs`. This branch is built on #75's head (`b867cf8`), as the orchestrator agreed, and merges `origin/main` once #75 lands.
- #73 (25-word phrase, REQ-protocol-11, `07-mnemonic-accounts.json`) and #68 (ACPQ write path, REQ-protocol-12) run in parallel. This change uses REQ-protocol-13, as the orchestrator assigned, and adds its files to the root `vectors/`, not to the numbered `ts/conformance/vectors/`.

## From the change's design.md

# Design

- **Emitter** `ts/scripts/emit-conversation-vectors.ts`, run from `ts/` with an optional output directory. It writes both files.
  - Inputs: Alice's seed `0x00..0x1f` and Bob's `0x20..0x3f` (the seeds of `01-key-derivation.json`), the kept secret `0x40..0x5f` and a wrong secret `0x60..0x7f`. X25519 and ML-KEM-768 keys come from the seeds.
  - Randomness: inside this process only, `crypto.getRandomValues` is replaced by a SHA-256 counter stream under a fixed label per file (`AlgoChat test vector pq-conversation-v1`, `AlgoChat test vector psk-kept-v1`). A draw outside a stream throws. The library code is unchanged and tests use the system generator.
  - The emitter reads back everything it writes with the TypeScript functions and throws if a case gives a different result from the one intended.
- **`vectors/pq-conversation-v1.json`**:
  - `accounts`: `alice` and `bob`, each with `seed`, `x25519_public` and `encaps_key`.
  - `handshakes`: `alice-to-bob` and `bob-to-alice`, each with `sender`, `recipient`, `note` (2366 bytes), `handshake_id` and `session_key`.
  - `messages`: 64 in send order (Alice's first, Bob's handshake and first reply, then alternating), each with `index`, `handshake`, `plaintext` and `note`. The texts include empty, one byte, multi-byte UTF-8, newlines, 280 bytes, and one per direction at 4002 bytes (a 4096-byte note).
  - `cases`, each `accept`, `open_as_sender` or `decrypt` by an account against a handshake, `accepted` or `rejected`:
    - Recipient accept: wrong recipient, changed key hash, one byte short and a message offered as a handshake are rejected. A changed sender wrap is accepted with the same key.
    - Sender recovery: the wrong account, a changed wrap, nonce or recipient ML-KEM ciphertext are rejected.
    - Message decrypt: the other direction's session, a changed tag, nonce or handshake id, a relabelled sender, version `0x01`, 93 bytes and 4097 bytes are rejected.
- **`vectors/psk-kept-v1.json`**:
  - `accounts` (seed and X25519 key) and `kept_psk`.
  - `notes`: 14 version `0x02` notes in both directions at counters 0, 1, 7, 41, 99, 100, 101, 150, 199, 200, 300, 301 and 4294967295, with an empty and a 3950-byte text (a 4096-byte note). Each has `from`, `to`, `counter`, `plaintext` and `note`. Recipient and sender both read each one.
  - `cases`: the kept secret reads; a wrong secret (recipient and sender), version changed to `0x01`, a changed counter field, tag or encrypted sender key (recipient and sender), 4097 bytes and a note shorter than the header are rejected.
  - `receive`: Bob's window for Alice's counters, 17 steps of `counter` and `expect` (unseen inside the window, replay, below and above the window, the last counter). A step is accepted when the counter is valid and is then recorded. `state_at_restart` is the state before step `restart_after` (10); `final_state` follows the last step.
- **Checks**:
  - `ts/src/pq/conversation.test.ts` and `ts/src/psk/kept.test.ts` each run the emitter into a temporary directory and require their committed file to match byte for byte; the failure names the regenerate command. Each then checks every field and case with the TypeScript functions, and the receive steps from a state rebuilt from `state_at_restart`.
  - `rs/tests/pq_conversation.rs` and `rs/tests/psk_kept.rs` read the `rs/vectors/` copies through the crate's public API: keys from the seeds, `accept_pq_handshake`, `open_pq_handshake_as_sender`, `decrypt_pq_message`, `decode_psk_envelope`, `decrypt_psk_message` and `PSKState`, which is saved and restored with `serde_json` at the restart. An unknown field, result or a missing file fails.
  - Both files join `SHARED` in `rs/tests/conformance.rs`, so the #70a release check requires exact copies in `rs/vectors/`.

## From the change's testing.md

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

## CodeQL follow-up (2026-11-06)

- On PR #78, the CodeQL check raised 17 Rust "cleartext logging of sensitive information" alerts. Panic and assert messages in both Rust tests formatted values taken from the vector's `accounts`.
- At `7e164e4` those messages are static, or name the side (recipient or sender) instead of the account. No assertion changed. Nothing was dismissed.
- Reruns at `7e164e4`:
  - `cargo test --locked --test pq_conversation --test psk_kept`: 3 and 3 passed.
  - clippy with `-D warnings` and `cargo fmt --check` were clean.
  - The same 23 mutations were all caught again.
  - Clean-clone `qualify.py rs` exited 0, with 258 + 8 + 4 + 3 + 3 tests in `rs/` and inside the crate. The crate sha256 is now `d440a4818094de9df95fed40f027e1a68c9966f37a94af78d06200a654ce1abd`.
- TypeScript files are unchanged since `8f62281`, so `qualify.py ts` was not rerun.

Not run here: the hosted Release qualification matrix, which runs on the PR.

## Where these lessons go

- `specs/protocol/context.md`
