---
change: prove-on-localnet-that-all-six-libraries-read-and-write-0x01-0x02-0x04-and-0x05-notes-for-empty-small-large-and-maximum
artifact: plan
---

# Plan

## Approach

Teach every reader the TypeScript version `0x02` rule, add Extra lock to Go, then run one LocalNet matrix for the four sizes and a multi-message exchange.

## Out of scope

Raven stays unwired. No `v1.3.0` tag. Identifier `0x03` is not added. Falcon signing is unchanged.

## Steps

1. Update PROTOCOL.md so version `0x02` header binding is part of `0x01` and `0x02`.
2. Align Rust v2 associated data with TypeScript and update its tests.
3. Accept both versions in Python, Kotlin, Swift, and Go.
4. Add Go Extra lock.
5. Extend each mesh tool and run the LocalNet matrix.
6. Record the rounds in PARITY.md and the review prompt.

## Risks

A wrong associated-data length makes every version `0x02` note fail closed. The matrix is the check.

## Constraints consulted

ENCRYPT-2 already records the hybrid session. `0x03` stays out of the public protocol.
