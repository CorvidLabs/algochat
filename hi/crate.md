---
hi: 1
families: [CRATE]
---

# Rust crate

## Intent

I want Raven Desktop built, so AlgoChat's Rust crate must be released with interop vectors.

On November 5, 2026, Leif approved this intent and CRATE-1 to CRATE-7 as written, through the orchestrator (orc tab, 11:00 MST): "Approve intent + A and B". Release A is `algochat` 0.6.0 from tag `v1.6.2`, with the Rust source unchanged from `v1.6.1` and packaging fixed ([algochat#67](https://github.com/CorvidLabs/algochat/issues/67)). Release B is 0.7.0 ([#73](https://github.com/CorvidLabs/algochat/issues/73), [#68](https://github.com/CorvidLabs/algochat/issues/68), and the vector parts of [#70](https://github.com/CorvidLabs/algochat/issues/70)). Attachments, Falcon accounts and Auto-join or Open channels are not part of this intent yet.

On November 6, 2026, Leif approved CRATE-8 to CRATE-12 as drafted, with the scope for rooms and Raven payloads, through the orchestrator (orc tab, in reply to the morning brief): "Ok yes I approve all". Those criteria are the later-release rows of [#70](https://github.com/CorvidLabs/algochat/issues/70): [#80](https://github.com/CorvidLabs/algochat/issues/80), [#81](https://github.com/CorvidLabs/algochat/issues/81), [#82](https://github.com/CorvidLabs/algochat/issues/82) and [#83](https://github.com/CorvidLabs/algochat/issues/83). Which crate release ships them is still Leif's decision.

## Criteria

- **CRATE-1**  I can add AlgoChat to a Rust app from crates.io by version number, with no path, Git or copied dependency.
- **CRATE-2**  A Rust app and Raven web can read each other's messages, and shared test vectors prove that before the crate is released.
- **CRATE-3**  If a shared vector a release relies on is missing, the check fails. It never passes quietly.
- **CRATE-4**  I can create and restore an account in Rust from the same 25 words I use in Raven web, and get the same address and keys.
- **CRATE-5**  I can publish my Hybrid key from Rust the same way Raven web does, signed or unsigned, without building the note myself.
- **CRATE-6**  Apps built on the crate never need their own copy of AlgoChat's cryptography.
- **CRATE-7**  Every crate release names the AlgoChat tag it came from, and nothing goes to crates.io until I approve that release.
- **CRATE-8**  I can join a room from Rust the way Raven web does: I open the room key sent to me over a real Hybrid session and read every message in that room.
- **CRATE-9**  When a room key changes, a Rust app reads each message with the key for its own epoch, the same messages Raven web can read and no others.
- **CRATE-10**  When a key handout is cut short, a Rust app resumes only the people who were missed, at most 16 at a time, the way Raven web does.
- **CRATE-11**  A Rust app reads rooms made before administration records existed, the way Raven web does.
- **CRATE-12**  Whatever Raven puts in a message comes out of a Rust app byte for byte as Raven web sent it, and AlgoChat never needs to understand it.
