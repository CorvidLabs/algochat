---
change: 70c-1-rust-joins-a-room-over-a-real-hybrid-session-the-way-typescript-does-from-a-shared-vector
artifact: research
---

# Research

- A spike ran in a scratch clone at `4da5be1`, not in this branch. It is not evidence for this change; the tests are rerun in the branch, failing first.
  - The draft emitter wrote the file twice with identical bytes (37,407 bytes).
  - TypeScript gave the intended result for all 20 cases.
  - A draft Rust reader passed 4 of 4 tests against that file, using only the crate's public API.
- TypeScript draws every random value from `crypto.getRandomValues`: handshake ephemeral keys, ML-KEM coins, delivery and message nonces, and the room key the emitter makes. The #70b seeded stream, replaced inside the emitter process only, makes that output repeatable without changing the library.
- PROTOCOL.md section 5.8.3 sets the rules this row checks:
  - Opening a delivery does not authorize it; the caller checks `delivery_authorized` with the room's accepted records and the authenticated sender and recipient.
  - An add authorizes delivery only to its subject, and a create authorizes none.
  - The message key binds the sender's 32-byte account public key, not its X25519 key.
  - Replay state is scoped to group and sender.
  - "Successful AEAD opening proves key possession" but does not replace membership checks, so a note from a key holder who is not a member is ignored.
- An Algorand address is the account's Ed25519 public key. The vector derives it from each seed, so the room identity and the session keys come from the same account. Earlier room vectors use fill-byte addresses, which can't be tied to a handshake.
- `openGroupMessage` in TypeScript and `open_group_message` in Rust take the caller's accepted `(epoch, counter)` pairs for that sender. Neither stores replay state.
- Rust and TypeScript expose the same room helpers: `reduce_admin`, `delivery_authorized`, `sender_may_post`, `open_group_key_delivery` and `open_group_message`. No new Rust API is needed.
- CodeQL's Rust "cleartext logging" query flagged #70b's tests where failure messages formatted values read from the vector's `accounts`. The fix was commit `7e164e4`. This change's tests keep such values out of their messages from the start.
