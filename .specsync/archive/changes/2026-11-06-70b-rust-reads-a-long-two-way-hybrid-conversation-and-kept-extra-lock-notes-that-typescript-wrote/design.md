---
change: 70b-rust-reads-a-long-two-way-hybrid-conversation-and-kept-extra-lock-notes-that-typescript-wrote
artifact: design
---

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
