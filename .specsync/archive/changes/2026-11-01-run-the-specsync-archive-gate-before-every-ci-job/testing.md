---
change: run-the-specsync-archive-gate-before-every-ci-job
artifact: testing
---

# Testing

- Each edited workflow parses with Ruby Psych (`Psych.safe_load`), and the
  printed job graph shows `archive-gate` with no `needs`, every other job
  needing it (or reaching it through `trust`), and `complete` listing it.
- `python3 -m unittest discover -s scripts/release` passes (25 tests), which
  covers the repository's own workflow parser, permission and
  `persist-credentials` rules, and the lane-trigger graph.
- spec-sync's `.github/scripts/archive-readiness.sh`, the script the pinned
  action runs, against this checkout: it fails while this change is open, as
  intended, and passes once the change is archived.
- `specsync change audit --strict` and `specsync check --strict` with specsync
  6.1.1, the version CI pins.
- On the pull request, the `Archive` check must run first in each triggered
  workflow and every other job must wait for it.
