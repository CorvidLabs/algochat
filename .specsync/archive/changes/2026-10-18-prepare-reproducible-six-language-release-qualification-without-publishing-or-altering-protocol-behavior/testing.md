---
change: prepare-reproducible-six-language-release-qualification-without-publishing-or-altering-protocol-behavior
artifact: testing
---

# Testing

Baseline observed: bun scripts/validate.ts passes through fledge. specsync check --strict passes after initial cache refresh. fledge trust verify --range v1.2.1..HEAD exits 0 but explicitly reports degraded provenance. attest verify --range v1.2.1..HEAD --json exits 1 after fetching the remote notes ledger, identifying missing required evidence for d53ecbb.

Planned tests: standard-library unit/integration tests for missing/malformed artifacts, incorrect expected identity, path handling, absent attest executable, invalid ref, empty range, non-ancestor range and missing attestations. A temporary local git fixture can exercise provenance without claiming evidence on project history.

Hosted real-package validation: all six current test suites and build/package commands, artifact contents and smoke tests where supported. Bind records to the PR head SHA and record tool versions; require all six jobs rather than assuming path-filtered absence means pass. Swift macOS hybrid results are hosted evidence only. Linux unsupported PQ behavior remains separately documented.

No local Python/Go/JVM dependency installation, LocalNet start, wallet access or publication. Rust may run offline only if cache is sufficient. New local dependency requirements must be returned for separate approval. Existing review results are historical context, never recast as a new final-head run.

Additional negative cases: stale SHA, missing language, absent artifact, failed recorded command, skipped required Apple lane, tampered artifact hash and malformed evidence must all fail qualification aggregation. Test outside-checkout consumers against real packaged artifacts, with declared runtime minima where feasible. Verify generated Kotlin POM and local Maven consumption; preserve and report the README/configuration mismatch. Cover trigger changes for shared vectors and manifests. No invented LocalNet receipt.

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| REQ-release-1 | .github/workflows/release-qualification.yml requires the six reusable lanes and Swift Linux; actual hosted results remain pending draft PR CI. |
| REQ-release-2 | Workflow permissions are contents: read; checkout persists no credentials; qualify.py uses npm pack, cargo package and isolated publishToMavenLocal only. No remote publication step or OIDC grant. |
| REQ-release-3 | scripts/release/test_release.py tests missing and tampered artifacts, unsafe archive paths and missing expected artifact formats; qualify.py checks real TypeScript package identity and Kotlin POM. Hosted artifact execution remains pending. |
| REQ-release-4 | ProvenanceTests cover valid, empty, invalid and non-ancestor ranges, missing Attest and propagated Attest failure. Baseline real Attest fails honestly for d53ecbb. |
| REQ-release-5 | docs/RELEASE.md lists preserved identities, versions, destinations and owner decisions. Library manifests are unchanged. |
| REQ-release-6 | qualify.py receipts separate local/hosted; evidence.py rejects non-hosted receipts. docs/RELEASE.md separates author-reported LocalNet and platform/minimum-runtime gaps. |
| REQ-release-7 | EvidenceTests reject stale SHA, dirty source, missing lanes/Apple/platform/tools/artifacts, failed command and tampered hashes; workflow also rejects failed/skipped jobs. |
| REQ-release-8 | qualify.py creates temporary consumers outside checkout for every lane; docs/RELEASE.md labels Go local replacement and unqualified runtime minima. Hosted real consumer results remain pending. |

Follow-up review repairs: shared packages.py rejects malformed archives, missing required members and wrong identities; receipt integrity remains explicitly separate. ArchiveTests reject links, FIFOs and devices. WorkflowTests guard read-only/no-publication qualification. Go/Swift exports include vectors and execute extracted parity tests. Rust packaged full-suite fixture reproducibility remains explicitly unqualified.

## Final product evidence

Candidate 074156ac8bb95793cfcacd5eeefc443078a43b9a passed all seven qualification lanes and the aggregate in https://github.com/CorvidLabs/algochat/actions/runs/39085460514. The downloaded artifact set also passed receipt/hash verification and every semantic package check locally. Hosted TypeScript: 270 tests. Rust: 234 unit tests and 14 doc tests. Apple Swift: 372 full tests and 6 extracted PQ tests. Linux Swift: 369 full tests and 3 extracted PQ tests, plus direct executable exit 1, empty stdout and exact unsupported-platform stderr. Python, Kotlin and Go full test/build/consumer lanes passed; Go extracted parity test passed. The hosted 18 release-check tests and local strict Spec-Sync also passed.

The independent source review relayed by source thread 01a118b4-4fe7-70fc-9f2d-dbbe961ba009 on this exact product head confirmed the four audit repairs and reported no new blocking defect. The recording agent separately inspected code, real artifacts and test results. This is agent review evidence, not human implementation acceptance. The user's subsequent request to archive authorizes same-PR finalization, not a fabricated human acceptance attestation.

Release-range provenance still fails for historical d53ecbb. The five new agent-authored commits pass the existing Attest policy based on truthful scoped evidence. Distribution/minimum-runtime/LocalNet and Rust packaged full-suite limitations remain in docs/RELEASE.md.
