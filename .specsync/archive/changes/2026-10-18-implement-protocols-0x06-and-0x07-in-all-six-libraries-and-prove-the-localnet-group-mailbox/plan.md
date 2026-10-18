---
change: implement-protocols-0x06-and-0x07-in-all-six-libraries-and-prove-the-localnet-group-mailbox
artifact: plan
---

# Plan

## Approach

TypeScript seals and opens 0x06 and 0x07 first and writes vectors/group-v1.json. Go, Rust, Python, Kotlin, and Swift match those bytes and the same round trip. One LocalNet mailbox then hosts a group of three, an added fourth member, a removal, and one 0x07 note. Every library opens that note. The removed member's previous group key does not.

## Out of scope

Raven's fan-out client, a seventh language, protocol 0x03, an Extra-lock membership layout, and a new tag. Parity is not written into the docs until the LocalNet run passes.

## Steps

1. Add the TypeScript seal and open functions and the frozen vector.
2. Port the same bytes to the other five libraries and their pqcross tools.
3. Run the LocalNet group script.
4. Record the rounds in PROTOCOL.md section 5.8.4, TEST-VECTORS.md, and PARITY.md.
5. Leave 0x03 unassigned.

## Risks

A second membership layout would split the six libraries. Swift hybrid setup needs macOS 26, while the 0x06 and 0x07 byte functions themselves are ChaCha20-Poly1305 and HKDF and can build on Linux. LocalNet must be up on this machine or the parity sentence stays unclaimed.

## Constraints consulted

Section 5.8 is the wire. The membership note uses the hybrid session key, so the wrap stays PQ level 3. The message key is HKDF-SHA256 with info AlgoChat-group-v1. No new KEM.
