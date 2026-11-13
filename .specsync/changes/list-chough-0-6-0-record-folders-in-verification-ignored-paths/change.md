---
id: list-chough-0-6-0-record-folders-in-verification-ignored-paths
state: implementing
type: operations
base_commit: c7ddd23d7c96d66aea4ca5e325f2389dd1da6bab
---

# List Chough 0.6.0 record folders in verification_ignored_paths

## Intent

List Chough 0.6.0 record folders in verification_ignored_paths

## Affected Canonical Specs

- None

## Acceptance Criteria

- .specsync/sdd.json verification_ignored_paths lists .chough/sessions/, .chough/archive/ and .chough/bugs/; chough doctor reports no records_in_verification finding; specsync check passes

## No-spec Rationale

Policy-only edit to .specsync/sdd.json that adds Chough's three record folders to verification_ignored_paths; no module contract changes
