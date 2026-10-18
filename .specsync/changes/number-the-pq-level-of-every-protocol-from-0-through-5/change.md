---
id: number-the-pq-level-of-every-protocol-from-0-through-5
state: implementing
type: documentation
base_commit: 629a29ce8c9a0c5cd64a60936399e80a2a4aaaee
---

# Number the PQ level of every protocol from 0 through 5

## Intent

Number the PQ level of every protocol from 0 through 5

## Affected Canonical Specs

- `protocol`

## Acceptance Criteria

- Section 5.4.2 defines PQ levels 0 through 5. Everyday is 0. Extra lock is 1 while the 32-byte PSK stays secret. Hybrid handshake and message are 3. Levels 2, 4, and 5 are unused by a message protocol. 0x03 stays unassigned. README and SECURITY.md use those integers.

## No-spec Rationale

Not applicable
