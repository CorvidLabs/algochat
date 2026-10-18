---
change: preserve-the-verified-six-language-parity-audit-with-portable-replay-scripts-and-explicit-rust-replay-and-swift-history
artifact: docs
---

# Docs

Add a dated verification report and self-contained selected evidence under `docs/verification/`, with exact candidate, native counts, local receipts, known failures, fixture activation, runtime caveats and the 84-criterion evidence map. Link it from `docs/ACCURACY.md`.

Add portable scripts under `scripts/parity/` for the all-six offline mesh and the Rust concurrent replay / Swift same-transaction history probes. Document prerequisites, commands, expected nonzero results on the audited baseline and output interpretation. Missing helpers and process errors fail; a historical pass does not qualify later commits.

Extend the root release spec and testing/context companions to describe the replay and probe interfaces. Preserve the root hosted qualification policy and progressive Trust provenance boundary. Verify the new scripts, existing 18 release checks, strict specs, artifact links and source isolation before the PR is opened. The explicit user PR request authorizes delivering this evidence scope, not accepting the remaining behavior gaps.
