---
id: CHG-0002-run-the-existing-jdk-17-and-21-ci-matrix-when-trust-and-specsync-governance-file
state: accepted
type: feature
base_commit: ccac4ab302937e85e57a3ef2fade003fa936d3ba
---

# Complete Kotlin AlgoChat SDD adoption and run the native CI matrix

## Intent

Canonically specify the existing Kotlin client, encrypted protocol, PSK extension, and cross-language vectors with 100 percent source coverage, while ensuring governance changes run the native JDK matrix.

## Affected Canonical Specs

- `client`
- `protocol`
- `psk`
- `cross-vectors`

## Acceptance Criteria

- Four active version 1.0.0 canonical specs accurately describe every production Kotlin source file without changing runtime behavior
- Every canonical requirement has a stable identifier and names the existing tests that provide evidence
- Strict SpecSync validation reports 100 percent production-source coverage with no placeholder text
- Pull requests changing Trust or SpecSync governance files trigger the unchanged JDK 17 and JDK 21 matrix
- Existing Gradle setup build test and artifact steps remain intact, and the full Trust gate passes

## No-spec Rationale

Not applicable
