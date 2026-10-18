# Release context

The six language jobs were path-filtered test-only lanes. Release qualification calls each as a reusable workflow and requires separate Apple/Linux Swift evidence. All PRs run qualification so shared changes cannot silently omit a language. Existing package identities and the soft provenance policy are preserved. Definition approval was explicitly supplied; human implementation acceptance remains outstanding.


The 2026-10-18 local audit at `237a974` is retained under docs/verification. It distinguishes a passing all-six low-level mesh from reproduced behavior, tooling and documentation failures. Portable replay and opt-in Rust/Swift probes are in scripts/parity; probes currently fail their required invariants and do not change library behavior. All 84 Human Intent criteria remain unchanged. The user requested the PR after receiving the completed audit; this is not human acceptance of full implementation parity.
