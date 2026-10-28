---
change: a-room-note-records-one-added-or-removed-person-so-a-room-can-hold-256-people-and-a-channel-is-another-room-owned-by
artifact: plan
---

# Plan

## Approach

Keep the existing full-list note. Add a delta note that uses a member-count sentinel and carries the subject plus an optional parent group id. Folding still builds the member list. The cap becomes 256 because the delta note no longer repeats that list.

## Out of scope

Go, Rust, Python, Kotlin, and Swift do not speak the new note yet. Raven does not vendor this branch. No release tag.

## Steps

1. Record the confirmed wants in hi/group.md before the behavior is treated as accepted.
2. Specify the delta note.
3. Implement and test it in TypeScript, including LocalNet.
4. Leif approved this SpecSync definition on 2026-10-28.

## Risks

A reader that only accepts full-list notes will ignore a delta note until its library is updated.

## Constraints consulted

GROUP-1 through GROUP-7 stay. The 4096-byte note limit stays. Key delivery is not an atomic group of 16.
