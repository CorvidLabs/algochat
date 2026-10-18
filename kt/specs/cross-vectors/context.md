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

## Accuracy audit

The legacy fixture format is named `.hex` files with seed/plaintext constants in the test, not a JSON record containing per-fixture seeds. Directory and individual-file absence can produce a green test with no imported evidence; the producer requirements remain conditional on actual fixture presence. Export bytes vary with production randomness. Committed PQ parity is a separate test.
