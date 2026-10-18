# Release context

The six language jobs are path-filtered. A language-tree change runs that lane. Protocol, vector, and release-script changes run the full matrix, including separate Apple and Linux Swift evidence. A README-only change does not. Existing package identities and the soft provenance policy are preserved. Definition approval was explicitly supplied; human implementation acceptance remains outstanding.


The 2026-10-18 local audit at `237a974` is retained under docs/verification. It distinguishes a passing all-six low-level mesh from reproduced behavior, tooling and documentation failures. Portable replay and opt-in Rust/Swift probes are in scripts/parity; probes currently fail their required invariants and do not change library behavior. All 84 Human Intent criteria remain unchanged. The user requested the PR after receiving the completed audit; this is not human acceptance of full implementation parity.
