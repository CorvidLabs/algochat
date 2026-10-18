---
id: say-that-envelope-version-0x02-is-accepted-and-stop-treating-the-withdrawn-handshake-note-as-an-acceptance-test
state: archived
type: documentation
base_commit: 620e6b72860844250fcf37f77e0a94c8cc01e1ae
---

# Say that envelope version 0x02 is accepted, and stop treating the withdrawn handshake note as an acceptance test

## Intent

Say that envelope version 0x02 is accepted, and stop treating the withdrawn handshake note as an acceptance test

## Affected Canonical Specs

- `protocol`

## Acceptance Criteria

- TEST-VECTORS.md no longer says version 0x02 is unsupported. PARITY.md limits vectors/pq-mlkem768.json acceptance to the encapsulation key, ciphertext, shared secret, and combiner. The 1278-byte handshake_note is not an acceptance test.

## No-spec Rationale

Not applicable
