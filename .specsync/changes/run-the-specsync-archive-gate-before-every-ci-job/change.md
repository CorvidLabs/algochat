---
id: run-the-specsync-archive-gate-before-every-ci-job
state: approved
type: operations
base_commit: fae3900f9729724c088bdbe67faf2d8a69655dec
---

# Run the SpecSync archive gate before every CI job

## Intent

Run the SpecSync archive gate before every CI job

## Affected Canonical Specs

- None

## Acceptance Criteria

- Every pull_request/push workflow (go, hi, kt, protocol, py, release-qualification, rs, spec-sync, status-renderer, swift, trust, ts, workflow-safety) starts with an archive-gate job named Archive that runs CorvidLabs/spec-sync pinned to 106aaa43d0bcf049f19b173ddb63815a25c3f931 with archive-gate-only: 'true'; every other job needs it directly or transitively (release-qualification complete also lists it and fails unless it succeeded), so an open change under .specsync/changes/ fails Archive and nothing else runs; scripts/release workflow tests still pass.

## No-spec Rationale

CI workflow ordering only; no canonical spec owns .github/workflows
