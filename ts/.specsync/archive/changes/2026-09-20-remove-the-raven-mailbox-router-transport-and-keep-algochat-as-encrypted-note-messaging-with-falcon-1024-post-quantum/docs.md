---
change: remove-the-raven-mailbox-router-transport-and-keep-algochat-as-encrypted-note-messaging-with-falcon-1024-post-quantum
artifact: docs
---

# Docs

- Drop the raven mailbox export block and comment from `src/index.ts`.
- Canonical spec and companions drop mailbox Public API rows and
  REQ-algochat-021…023; add REQ-algochat-025.
- README already documents Falcon-1024 accounts and encrypted notes; it
  never documented the mailbox transport. No README mailbox section to
  remove. Keep the existing disclosure that Falcon identity does not make
  X25519 key exchange quantum-safe; PSK remains the hybrid defense.
