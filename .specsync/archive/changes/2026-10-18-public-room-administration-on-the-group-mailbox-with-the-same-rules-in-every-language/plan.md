---
change: public-room-administration-on-the-group-mailbox-with-the-same-rules-in-every-language
artifact: plan
---

# Plan

## Approach

Specify 0x03 and 0x06 action 5 in PROTOCOL.md section 5.8, pin the bytes in vectors/group-admin-v1.json, and implement the same reducer, sealer, and opener in TypeScript, Go, Python, Rust, Kotlin, and Swift.

## Out of scope

Raven UI, merging the open parity and CI pull requests, hiding member addresses, retracting a key that was already delivered, and forward secrecy.

## Steps

1. Keep the captured GROUP criteria and the REPO-2 update.
2. Materialize REQ-protocol-6 onto the protocol requirements.
3. Keep section 5.8.4 as the historical membership run.
4. Prove the vector in every library and one LocalNet pair of rooms.

## Risks

A join request that confirms after the roster changes must be asked again. Concurrent non-request records that share a parent have one winner.

## Constraints consulted

The approved room plan and hi/group.md. No second REPO id was minted.
