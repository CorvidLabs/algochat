---
spec: godot.spec.md
---

## User Stories

- A player in a Godot game can chat with another player through AlgoChat without leaving the game.
- A note that game sends can be read by the TypeScript, Swift, Python, Rust, Kotlin, and Go libraries, and the game can read a note any of those libraries wrote.
- The Godot game reaches that parity by calling the Rust library.
- A game can ship that chat with everyday notes, and add extra lock, hybrid sessions, or group mail only when that game needs them.
- The game says, in plain words, that addresses, timing, and amounts are public.

## Acceptance Criteria

### REQ-godot-1

The Godot example SHALL let a player send an everyday AlgoChat note from a loaded account without leaving the game.

#### Acceptance Criteria

- The scene shows the account address, a recipient address, and a message field.
- Send seals the message in the extension before a LocalNet payment is posted.

### REQ-godot-2

A note the example seals SHALL open in TypeScript, Swift, Python, Rust, Kotlin, and Go to the same text. The example SHALL open one everyday note written by each of those six.

#### Acceptance Criteria

- `godot/parity/everyday.py` records twelve successful opens: six readers on the Godot note, and Godot on six foreign notes.
- Sender and recipient plaintext both match.

### REQ-godot-3

The GDExtension SHALL seal and open by calling the Rust `algochat` crate. It SHALL NOT implement X25519, ChaCha20-Poly1305, or HKDF itself.

#### Acceptance Criteria

- The extension's seal path calls `encrypt_message_v2` and its open path calls `decrypt_message`.

### REQ-godot-4

This example SHALL seal everyday protocol `0x01` at envelope version `0x02`. It SHALL NOT expose extra lock, hybrid sessions, or group mail.

#### Acceptance Criteria

- A sealed note begins with bytes `0x02 0x01`.
- The extension has no PSK, ML-KEM, or group method.

### REQ-godot-5

The scene SHALL show, in plain words, that addresses, timing, and amounts are public.

#### Acceptance Criteria

- The visible notice is "Addresses, timing, and amounts are public."

## Constraints

- The parity harness uses demo seeds. The scene loads `user://localnet-wallet.json` when that file exists.
- The parity run is local evidence. It does not submit a transaction.
- The extension binary is built for the host platform and is not committed.

## Out of Scope

- Mainnet payments. The scene can post on AlgoKit LocalNet through `ts/scripts/godot-raven.ts`.
- Extra lock, hybrid sessions, group mail, and room administration.
- A seventh row in `implementations.json`.
- HTML5 export.
