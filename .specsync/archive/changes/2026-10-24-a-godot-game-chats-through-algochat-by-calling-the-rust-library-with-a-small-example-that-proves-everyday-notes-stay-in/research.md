---
change: a-godot-game-chats-through-algochat-by-calling-the-rust-library-with-a-small-example-that-proves-everyday-notes-stay-in
artifact: research
---

# Research

Godot 4.7.2 is installed as `godot` at `/opt/homebrew/bin/godot`. gdext 0.4 and later load in any Godot at least as new as the API feature selected at build time. gdext 0.5.4 added the `api-4-7` feature. The build sets `GODOT4_BIN` because gdext looks for `godot4` by default.

The six libraries already expose everyday `write01` and `read01` through `ts/scripts/pq-io.ts`, `py/tools/pq_io.py`, and the Go, Rust, Kotlin, and Swift `pqcross` helpers. `scripts/parity/mesh.py` shows that TypeScript writes envelope version `0x02` and the other five write `0x01`, and that every library reads both. The Godot extension writes version `0x02` through `encrypt_message_v2`, the same framing TypeScript already uses. Readers in the other five already open that framing.

A pure GDScript cryptography port was ruled out. Godot's `Crypto` class provides RSA, HMAC, AES, and SHA-256. The protocol needs X25519, ChaCha20-Poly1305, and HKDF-SHA256 for an everyday note, and ML-KEM-768 for modes this example does not ship.
