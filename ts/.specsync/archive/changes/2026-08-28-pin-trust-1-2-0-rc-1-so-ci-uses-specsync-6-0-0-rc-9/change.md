---
id: pin-trust-1-2-0-rc-1-so-ci-uses-specsync-6-0-0-rc-9
state: archived
type: operations
base_commit: d8fe2322e83b18ed2575aff3ed051ebd5d537ff8
---

# Pin Trust 1.2.0-rc.1 so CI uses SpecSync 6.0.0-rc.9

## Intent

Pin Trust 1.2.0-rc.1 so CI uses SpecSync 6.0.0-rc.9

## Affected Canonical Specs

- None

## Acceptance Criteria

- Trust workflow pins CorvidLabs/trust@e964e042f7f2756333d4c46e685a4a6dc09077de (v1.2.0-rc.1). fledge lanes run verify still passes.

## No-spec Rationale

CI pin only. Trust 1.2.0-rc.1 defaults SpecSync to 6.0.0-rc.9; no canonical spec text changes.
