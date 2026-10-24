---
change: a-godot-game-chats-through-algochat-by-calling-the-rust-library-with-a-small-example-that-proves-everyday-notes-stay-in
artifact: design
---

# Design

One window, two columns, one notice.

The notice sits across the top and is always visible: "Addresses, timing, and amounts are public." It is not a tooltip and not a log line that scrolls away.

Alice is the left column and Bob is the right. Each column has a transcript, a line edit, and a Send button. A send seals an everyday note with that column's demo seed and appends the opened text to the other column's transcript. The demo seeds are `0x11` * 32 and `0x22` * 32, labeled as demo keys so the same window can open both sides. They are not a wallet.

Colors stay on a dark field (`#1c1915`) with an amber notice (`#e6b35a`) and two separate panes (`#2a2622`). The type is the engine default. The layout is a testable chat, not a game skin.

There is no network button, no fee, and no account import in this scene.
