---
change: hold-every-language-to-the-channel-rules-and-the-256-member-cap
artifact: plan
---

# Plan

## Approach

Add the reject cases to `vectors/group-admin-delta-v1.json` on `feat/room-notes-256`. Generate them with the TypeScript library so the error text is the library's own sentence. Each language's delta test walks `draft_errors` and passes the parent room when the case has one.

## Out of scope

No new human-intent criterion. No canonical spec edit. No second wire layout. No tag, publish, or merge of `feat/room-notes-256` into main.

## Steps

1. Add the 257th-member draft error, the forged channel draft errors, and the forged channel-create reduction.
2. Walk those cases from the TypeScript delta test.
3. Walk the same array from the Go, Rust, Python, Kotlin, and Swift delta tests.
4. Record the cases in TEST-VECTORS.md.
5. Merge the language branches into `feat/room-notes-256` after the tests pass.

## Risks

A language that ignores `parent_room` would miss the channel rules. The delta tests pass that field. A full rewrite of the vector would hide the new cases, so the merge keeps the existing objects and only appends.

## Constraints consulted

GROUP-8.b is the 256-person room. GROUP-9 is the channel and its owner. The delta note layout stays the one already frozen.
