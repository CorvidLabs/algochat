---
id: hold-every-language-to-the-channel-rules-and-the-256-member-cap
state: implementing
type: feature
base_commit: c1f0eb2bb1a5ab1e7a95de83ec49ebda8a298721
---

# Hold every language to the channel rules and the 256-member cap

## Intent

Hold every language to the channel rules and the 256-member cap

## Affected Canonical Specs

- None

## Acceptance Criteria

- Every language rejects a 257th member and forged channel actions from the shared delta vector.

## No-spec Rationale

GROUP-8.b and GROUP-9 already require the 256-member cap and channel ownership. This change adds shared reject cases and makes every language walk them. Canonical specs do not change.
