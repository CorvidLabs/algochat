---
change: 70c-2-rust-follows-a-room-key-change-and-resumes-an-interrupted-key-handout-the-way-typescript-does-from-a-shared
artifact: plan
---

# Plan

## Approach

One shared vector, written by TypeScript and read by both languages, proves three things about a room key change, in Rust as in Raven web:
- each message opens only under the key for its own epoch;
- an interrupted handout resumes only the people who were missed, at most 16 at a time;
- a removed member leaves the channel, which gets its own new key.

This change is a definition only for now. The definition and the failing tests are committed, and the emitter and vector are built after #70c-1's code lands, as the orchestrator directed. No library code changes.

## Decisions for approval

- **The room continues #70c-1's accounts and adds sixteen more.** The owner, `member_a` and `member_b` keep their #70c-1 seeds, and `m03` to `m18` use fill-byte seeds. This gives the 19 of PROTOCOL.md 5.8.5. Rejected: reading `room-session-v1.json` from this test, which would make one vector depend on another.
- **Every member's session comes from a real handshake.** That costs 18 handshake notes, about 85 KB of the 198 KB file. Rejected: supplied session keys, which would lose what #70c-1 established.
- **The first batch of 16 misses its last payment.** The resumed batch then holds the missed one and the 17th, as in the LocalNet run. Rejected: missing a payment in the middle of the batch, which tests the same lists less plainly.
- **The removal-subject check is out of scope as untestable.** A removal never authorizes its subject. That check cannot be observed through `delivery_authorized`, because the subject is never a member after the removal. It is stated as untestable rather than claimed.

## Out of scope

- Rekey and ownership transfer, which rotate the key the same way.
- Admins.
- Bots.
- Membership at an exact chain position inside one epoch.
- Blockchain authentication of senders and transaction ids.
- Legacy rooms (#82) and Raven payloads (#83).
- Library code in TypeScript or Rust, and any wire-format or protocol-version change.
- Checking this vector in Go, Python, Kotlin or Swift.
- Any version bump, tag or publish (0.8.0 needs Leif's approval).

## Steps

1. Write the failing tests: `ts/src/pq/room-rekey.test.ts`, `rs/tests/room_rekey.rs` and the `SHARED` entry. Commit them with this definition and record that they fail because the vector file is missing.
2. After approval, and after #70c-1's code has landed: add `ts/scripts/emit-room-rekey-vector.ts`, write the file with it, and copy it to `rs/vectors/`.
3. Update TEST-VECTORS.md, `specs/protocol`, `rs/README.md` and `CHANGELOG.md` (Unreleased).
4. Run the TypeScript, Rust and release checks, clean-clone qualification and the mutation runs, then `fledge lanes run verify` and `fledge trust verify`, and record the evidence.

Relative size: medium. The work is one emitter and two tests, with no library code. The main uncertainty is merging, since the branch is stacked three deep.

## Risks

- The seeded stream depends on how the library draws randomness. A dependency update that changes that fails the TypeScript test with the regenerate command.
- If Rust and TypeScript disagree on a list, an order or a state, that is an interop bug. It gets its own bug and a fix, never an edited vector.
- The 198 KB file ships in the crate. That is within the size the #70c proposal estimated.

## Constraints consulted

- CRATE-9, CRATE-10 and CRATE-3.
- GROUP-5.b to GROUP-5.d, GROUP-10 and GROUP-11.
- PROTOCOL.md 5.8.3 and 5.8.5.
- REQ-protocol-10 and REQ-release-3.
- The #70a, #70b and #70c-1 lessons: vectors come only from TypeScript; test messages carry no account-derived values; every claimed library check has a case only that check refuses.
