---
id: CHG-0004-install-the-conformance-ci-workflow-delivered-with-the-test-vector-suite-so-ever
state: archived
type: feature
base_commit: 885496a6b33d301e46fc20f4e7e7dc8f917d9e8e
---

# Install the conformance CI workflow delivered with the test-vector suite so every push to main and every pull request runs the unit tests, the 79 conformance checks, and the deterministic-vector regeneration guard

## Intent

Install the conformance CI workflow delivered with the test-vector suite so every push to main and every pull request runs the unit tests, the 79 conformance checks, and the deterministic-vector regeneration guard

## Affected Canonical Specs

- None

## Acceptance Criteria

- the conformance workflow file exists at .github/workflows/conformance.yml byte-identical to the merged template conformance/ci/conformance.yml; the workflow runs green on this change's own pull request
- executing bun test
- the 79-check vector verification
- and the deterministic regeneration comparison; the Trust contract gate passes with the workflow path covered by this change

## No-spec Rationale

CI orchestration only: copies the already-merged conformance/ci/conformance.yml template verbatim into .github/workflows; no product source, spec, test, or vector bytes change
