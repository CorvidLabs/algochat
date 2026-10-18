---
id: implement-the-1-3-0-hybrid-session-in-python-kotlin-and-swift
state: archived
type: feature
base_commit: 9e044821ea208dce87d04025274d57b769d88359
---

# Implement the 1.3.0 hybrid session in Python, Kotlin, and Swift

## Intent

Implement the 1.3.0 hybrid session in Python, Kotlin, and Swift

## Affected Canonical Specs

- None

## Acceptance Criteria

- Python, Kotlin, and Swift each open the TypeScript handshake fixture and the LocalNet note, recover the same session key, and still pass their existing 0x01 and 0x02 tests.

## No-spec Rationale

PROTOCOL.md 1.3.0 already specifies 0x04 and 0x05. This change implements that contract in Python, Kotlin, and Swift.
