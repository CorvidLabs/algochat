---
change: swift-speaks-the-delta-room-note-and-the-256-member-cap
artifact: plan
---

# Plan

## Approach

Implement the existing delta room note in `swift/Sources/AlgoChat/Crypto/GroupAdmin.swift` and say so in the Swift module notes. Do not edit the canonical protocol spec or the vectors. Those already describe this layout.

## Out of scope

A second note layout. A protocol tag. Raven vendoring. The uncommitted parent-room adapter. The other languages each have their own change.

## Steps

1. Teach Swift to draft and reduce the delta note, including a channel parent id and the 256 member cap.
2. Update the Swift module notes so they match that behavior.
3. Cover the full-list rejection, the 256 fold, the old vector, the delta vector, the channel roster, and a resumed key payment.
4. Leif approved this SpecSync definition on 2026-10-28.

## Risks

A Swift reader that only accepts full-list notes will ignore a delta note. This change is that reader update.

## Constraints consulted

GROUP-8 through GROUP-13 already live in the protocol change. The 4096-byte note limit stays. Key delivery is not an atomic group of 16.
