---
id: CHG-0005-install-the-conformance-ci-workflow-so-every-push-to-main-and-every-pull-request
state: archived
type: feature
base_commit: af196bb37f92bbcb42b93b9e909b63270111929e
---

# Install the conformance CI workflow so every push to main and every pull request runs the unit tests, the 79 conformance checks, and the deterministic-vector regeneration guard; supersedes archived CHG-0004, whose deliverable landed on this branch before its installation could be verified in place

## Intent

Install the conformance CI workflow so every push to main and every pull request runs the unit tests, the 79 conformance checks, and the deterministic-vector regeneration guard; supersedes archived CHG-0004, whose deliverable landed on this branch before its installation could be verified in place

## Affected Canonical Specs

- None

## Acceptance Criteria

- the conformance workflow file exists at .github/workflows/conformance.yml; the workflow ran green on this change's pull request executing bun test
- the 79-check vector verification
- and the deterministic regeneration comparison; the Trust contract gate passes with the workflow path covered by this change

## No-spec Rationale

CI orchestration only: adds the conformance workflow file; no product source, spec, test, or vector bytes change
