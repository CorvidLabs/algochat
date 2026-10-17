---
change: state-the-hybrid-sender-wrap-and-announcement-rules-exactly-and-make-rust-and-go-follow-them
artifact: plan
---

# Plan

## Approach

Change the handshake in all six libraries to the same 2366-byte layout, and state that layout in PROTOCOL.md.

## Out of scope

A new LocalNet matrix. Tagging v1.3.0. Swift on Linux.

## Steps

1. Update the TypeScript reference and its tests.
2. Port the same bytes to Go, Rust, Python, Kotlin, and Swift.
3. Let Rust initiate from public keys, and reject ACPQ in X25519 discovery.
4. Add ACPQ signature checks in Go and Rust.
5. Correct the security sentences that overclaimed.

## Risks

Old 1278-byte handshakes no longer open. That layout was never tagged.

## Constraints consulted

Identifier 0x03 stays unassigned. The combiner vector stays pinned.
