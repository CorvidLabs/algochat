---
hi: 1
families: [GODOT]
---

# Godot

## Intent

I want a Godot game to have native AlgoChat, so a player can talk to another player without leaving the game. The note should be the same note the other AlgoChat libraries already read and write, because the game calls the Rust library. Everyday notes are enough for a game to ship. The game says, in plain words, that addresses, timing, and amounts are public.

## Criteria

- **GODOT-1**  A player in a Godot game can chat with another player through AlgoChat without leaving the game.
- **GODOT-2**  A note that game sends can be read by the TypeScript, Swift, Python, Rust, Kotlin, and Go libraries, and the game can read a note any of those libraries wrote.
- **GODOT-3**  The Godot game reaches that parity by calling the Rust library.
- **GODOT-4**  A game can ship that chat with everyday notes, and add extra lock, hybrid sessions, or group mail only when that game needs them.
- **GODOT-5**  The game says, in plain words, that addresses, timing, and amounts are public.
- **GODOT-6**  I can send a test message for every AlgoChat protocol, and each one can be opened by the TypeScript, Swift, Python, Rust, Kotlin, and Go libraries, and the game can open a test message any of those libraries wrote.
- **GODOT-7**  I can create a wallet in the Godot game and fund it with a tiny amount of ALGO.
- **GODOT-8**  I can chat between that wallet and the Raven app on this computer, on any protocol Raven uses.
- **GODOT-9**  The game tells me the fee before it spends, and it says the address, the time, and the amount are public.
