---
id: a-godot-game-chats-through-algochat-by-calling-the-rust-library-with-a-small-example-that-proves-everyday-notes-stay-in
state: verifying
type: feature
base_commit: b3908952e72ba6a3d4f44d99c5e9a7824c948733
---

# A Godot game chats through AlgoChat by calling the Rust library, with a small example that proves everyday notes stay in parity with TypeScript, Swift, Python, Rust, Kotlin, and Go.

## Intent

A Godot game chats through AlgoChat by calling the Rust library, with a small example that proves everyday notes stay in parity with TypeScript, Swift, Python, Rust, Kotlin, and Go.

## Affected Canonical Specs

- `godot`

## Acceptance Criteria

- A headless Godot example seals one everyday version 0x02 note and opens it as sender and recipient. TypeScript, Swift, Python, Rust, Kotlin, and Go each open that note to the same text. The example opens one everyday note written by each of those six. The example shows that addresses, timing, and amounts are public. The binding calls the Rust algochat crate. Extra lock, hybrid sessions, and group mail stay out of this example.

## No-spec Rationale

Not applicable
