---
module: godot
version: 2
status: active
files:
  - godot/extension/src/lib.rs
depends_on:
  - protocol
---

# Godot

## Purpose

A Godot 4 game can exchange everyday AlgoChat notes by calling the Rust library. The example is a send scene plus a headless parity check against TypeScript, Swift, Python, Rust, Kotlin, and Go. A LocalNet script posts a sealed note. It is not a seventh protocol implementation.

## Public API

Rust functions in `godot/extension/src/lib.rs`. The GDExtension class `AlgoChat` calls these and returns a dictionary with `ok` and `error`. A seal also returns `note`. An open also returns `text`.

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `seal_everyday_note` | plaintext, 32-byte sender seed, 32-byte recipient public key | note bytes | Seals protocol `0x01`, envelope version `0x02`, by calling Rust `encrypt_message_v2`. |
| `open_everyday_note` | note bytes, 32-byte seed | plaintext | Opens that note by calling Rust `decrypt_message`. The seed may be the sender or the recipient. |
| `encryption_public_key` | 32-byte seed | 32-byte X25519 public key | Derived with the Rust crate. A seed of any other length is an error. |

## Invariants

1. A successful seal starts with bytes `0x02 0x01` and is at most 4096 bytes.
2. The same note opens to the same text for the sender seed and the recipient seed.
3. Seal and open call the Rust crate. The extension does not implement X25519, ChaCha20-Poly1305, or HKDF.
4. The scene keeps the sentence "Addresses, timing, and amounts are public." visible.
5. Extra lock, hybrid sessions, and group mail are not part of this API.

## Behavioral Examples

### Scenario: Two players in one window

- **Given** Alice's demo seed `0x11` repeated for 32 bytes and Bob's demo seed `0x22` repeated for 32 bytes
- **When** Alice sends "hello from godot"
- **Then** Bob's transcript shows that text, and the note bytes open in all six libraries

### Scenario: A foreign everyday note

- **Given** an everyday note one of the six libraries wrote for those seeds
- **When** the example opens it with the sender seed and with the recipient seed
- **Then** both opens return that library's plaintext

## Error Cases

| Condition | Behavior |
|-----------|----------|
| Seed or recipient public key is not 32 bytes | `ok` is false and no note is returned |
| Plaintext is larger than the everyday maximum | `ok` is false |
| Note bytes fail authentication | `ok` is false and no plaintext is returned |
| Note is a key-publish payload | `ok` is false |

## Dependencies

### Consumes

| Module | What is used |
|--------|-------------|
| Rust `algochat` | `derive_keys_from_seed`, `encrypt_message_v2`, `decrypt_message`, envelope encode and decode |
| Godot 4.7 | GDExtension host for the example. The build selects gdext `api-4-7`. |

### Consumed By

| Module | What is used |
|--------|-------------|
| `godot/example` | The scene and the headless parity script |
| `godot/parity/everyday.py` | Drives the six `write01` / `read01` helpers and the headless script |

## Change Log

| Date | Change |
|------|--------|
| 2026-10-24 | Add the Godot example that calls the Rust library for everyday notes. |
| 2026-10-24 | a-godot-game-chats-through-algochat-by-calling-the-rust-library-with-a-small-example-that-proves-everyday-notes-stay-in: A Godot game chats through AlgoChat by calling the Rust library, with a small example that proves everyday notes stay in parity with TypeScript, Swift, Python, Rust, Kotlin, and Go. |
