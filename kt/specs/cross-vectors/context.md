---
spec: cross-vectors.spec.md
---

## Context

AlgoChat's envelope is a language-neutral binary protocol. Unit round trips within Kotlin cannot detect a mutually consistent but incompatible encoder/decoder change, so external vectors are required.

## Related Modules

- `protocol` is the production system exercised by the vectors.
- `psk` shares the broader cross-language compatibility discipline.

## Design Decisions

- Producer-specific tests make compatibility failures attributable.
- Optional sibling discovery supplements, but never replaces, committed evidence.
- Export remains a test utility so no fixture machinery enters the library API.
