---
change: a-godot-game-chats-through-algochat-by-calling-the-rust-library-with-a-small-example-that-proves-everyday-notes-stay-in
artifact: plan
---

# Plan

## Approach

Add a godot-rust GDExtension that wraps `encrypt_message_v2` and `decrypt_message` from `rs/`. Add a two-pane Godot 4 scene for a local Alice and Bob exchange, with the public-metadata notice always visible. Prove parity with a headless Godot script plus the existing six-language `write01` and `read01` helpers.

## Out of scope

No Algorand payment, indexer poll, or fee display. No extra lock, hybrid session, group mailbox, or room administration in the extension. No seventh library row in `implementations.json`. No HTML5 export. The full `scripts/parity/mesh.py` matrix stays the six-language low-level mesh.

## Steps

1. Write the `godot` spec and these change artifacts.
2. Build the extension against Godot 4.7 with gdext `api-4-7`.
3. Add the scene and the headless parity script.
4. Run `python3 godot/parity/everyday.py` and keep the twelve opens.

## Risks

The extension binary is platform-specific and is built locally, not committed. A dirty tree makes the parity run local evidence, not a release qualification. Swift and Kotlin helper builds are slow and can fail the run before any note is opened.

## Constraints consulted

GODOT-3 keeps cryptography in the Rust library. GODOT-4 limits this example to everyday notes. SEND-5 still requires a note from one implementation to open in the others. HONEST-1 still applies, and the scene says so.
