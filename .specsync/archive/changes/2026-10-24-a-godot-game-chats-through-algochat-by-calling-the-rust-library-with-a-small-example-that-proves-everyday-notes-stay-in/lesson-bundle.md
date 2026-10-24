# Lesson bundle — a-godot-game-chats-through-algochat-by-calling-the-rust-library-with-a-small-example-that-proves-everyday-notes-stay-in

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: A Godot game chats through AlgoChat by calling the Rust library, with a small example that proves everyday notes stay in parity with TypeScript, Swift, Python, Rust, Kotlin, and Go.
- **Kind**: Feature
- **Specs**: godot
- **Paths**: godot, hi/godot.md
- **Acceptance**: A headless Godot example seals one everyday version 0x02 note and opens it as sender and recipient. TypeScript, Swift, Python, Rust, Kotlin, and Go each open that note to the same text. The example opens one everyday note written by each of those six. The example shows that addresses, timing, and amounts are public. The binding calls the Rust algochat crate. Extra lock, hybrid sessions, and group mail stay out of this example.

## Evidence

- Verification commit: `f28bc9fa45bb0f94c1938262b13172f6dcae1b44`
- Base commit: `b3908952e72ba6a3d4f44d99c5e9a7824c948733`
- Verified by: `specsync check --spec godot`

## From the change's context.md

# Context

A Godot game needs native AlgoChat. Human Intent GODOT-1 through GODOT-5 are the agreed outcomes. The six protocol libraries already pass an everyday, extra-lock, and hybrid mesh. GDScript's engine crypto does not provide X25519, ChaCha20-Poly1305, HKDF-SHA256, or ML-KEM-768, so a seventh handwritten port would be a new parity surface.

This change adds a Godot 4 example that calls the existing Rust crate. Everyday notes are the only mode. The example is not a seventh entry in the protocol matrix and it does not post a payment.

## From the change's design.md

# Design

One window, two columns, one notice.

The notice sits across the top and is always visible: "Addresses, timing, and amounts are public." It is not a tooltip and not a log line that scrolls away.

Alice is the left column and Bob is the right. Each column has a transcript, a line edit, and a Send button. A send seals an everyday note with that column's demo seed and appends the opened text to the other column's transcript. The demo seeds are `0x11` * 32 and `0x22` * 32, labeled as demo keys so the same window can open both sides. They are not a wallet.

Colors stay on a dark field (`#1c1915`) with an amber notice (`#e6b35a`) and two separate panes (`#2a2622`). The type is the engine default. The layout is a testable chat, not a game skin.

There is no network button, no fee, and no account import in this scene.

## From the change's testing.md

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

## Where these lessons go

- `specs/godot/context.md`
