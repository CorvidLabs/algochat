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

The Godot example SHALL let two players in one scene exchange an everyday AlgoChat note without leaving the game.

#### Acceptance Criteria

- Alice's send appears in Bob's transcript, and Bob's send appears in Alice's transcript.
- The exchange uses sealed notes, not plain text copied between the two panes.

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

- Demo seeds in the scene are test keys, not a wallet.
- The parity run is local evidence. It does not submit a transaction.
- The extension binary is built for the host platform and is not committed.

## Out of Scope

- Algorand payments, indexer reads, and fees.
- Extra lock, hybrid sessions, group mail, and room administration.
- A seventh row in `implementations.json`.
- HTML5 export.
