---
change: a-godot-game-chats-through-algochat-by-calling-the-rust-library-with-a-small-example-that-proves-everyday-notes-stay-in
artifact: testing
---

# Testing

`python3 godot/parity/everyday.py --output <new directory outside the checkout>` builds the extension and the six existing helpers, then checks:

- Godot seals "hello from godot" from seed `0x11` * 32 to seed `0x22` * 32 at version `0x02`, protocol `0x01`.
- Godot opens that note as sender and as recipient.
- Each of TypeScript, Swift, Python, Rust, Kotlin, and Go opens that note as sender and recipient.
- Each of those six writes one everyday note, and Godot opens it as sender and recipient.

The output directory follows the mesh rule: a new directory outside the checkout. The run is local evidence. It does not post a transaction and it does not rerun the hybrid mesh.

Headless Godot is `godot --headless --path godot/example --script res://parity_check.gd`. The scene notice is checked by reading `chat.tscn` for the public-metadata sentence and by the script's own constant when the parity scene tree loads.

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| REQ-godot-1 | `godot/example/chat.gd` seals a note and opens it into the other pane. `godot --headless --path godot/example --quit-after 1` loaded that scene and exited 0. A manual button press in the window was not run. |
| REQ-godot-2 | `/tmp/algochat-godot-parity-2/checks.json` records 19 passed and 0 failed: six `write01` notes, Godot opening each of them, and all six libraries opening the Godot note. |
| REQ-godot-3 | `godot/extension/src/lib.rs` calls `encrypt_message_v2` and `decrypt_message`. `cargo test --manifest-path godot/extension/Cargo.toml` passed `round_trip_and_flipped_byte` and `rejects_short_keys`. |
| REQ-godot-4 | The parity outbox note begins with `0201`. The extension source has no PSK, ML-KEM, or group function. |
| REQ-godot-5 | `godot/example/chat.tscn` shows "Addresses, timing, and amounts are public." The parity outbox `notice` field is that same sentence. |
