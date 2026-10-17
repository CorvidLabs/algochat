---
change: implement-the-1-3-0-hybrid-session-in-python-kotlin-and-swift
artifact: plan
---

# Plan

## Approach

Port the handshake and message operations. Pin them to vectors/pq-mlkem768.json and to /tmp/pq-live.json when that LocalNet capture is present.

## Out of scope

No change to the wire format. No v1.3.0 tag until these three pass. Raven stays unwired.

## Steps

1. Implement Python, Kotlin, and Swift.
2. Run each suite.
3. Update PARITY.md only for rows that pass.

## Risks

A library that hashes the seed instead of using d||z will miss the encapsulation key.

## Constraints consulted

ENCRYPT-2. Identifier 0x03 stays unassigned.
