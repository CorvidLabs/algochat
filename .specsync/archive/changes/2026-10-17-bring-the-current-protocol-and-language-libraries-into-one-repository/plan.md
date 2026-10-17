---
change: bring-the-current-protocol-and-language-libraries-into-one-repository
artifact: plan
---

# Plan

## Approach

Import each library with git archive at the note-ceiling commit. Keep PROTOCOL.md, the test vectors, and human intent at the root. Add CI that runs each library's tests.

## Out of scope

Post-quantum handshakes, Raven, and rewriting any library.

## Steps

1. Import the six libraries and the protocol documents.
2. Point implementations.json at the folders.
3. Add hi criteria and the library, hi, and spec-sync workflows.
4. Run validate and the library tests.

## Risks

A library test can fail because a tool is missing on this machine. CI runs the same commands.

## Constraints consulted

The wire format stays 0x01 and 0x02.
