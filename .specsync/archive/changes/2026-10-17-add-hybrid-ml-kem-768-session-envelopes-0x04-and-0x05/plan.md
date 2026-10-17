---
change: add-hybrid-ml-kem-768-session-envelopes-0x04-and-0x05
artifact: plan
---

# Plan

## Approach

Land the spec, the combiner vector, and the TypeScript reference first. Swift, Rust, Python, Kotlin, and Go match the vector before the v1.3.0 tag.

## Out of scope

Raven wiring. Registry publishes. Assigning 0x03.

## Steps

1. Document 0x04 and 0x05.
2. Implement TypeScript and test it.
3. Port the other languages.

## Risks

Noble has no independent audit. The session is not forward secret.

## Constraints consulted

0x01 and 0x02 stay. 0x03 is not assigned.
