---
module: release
version: 2
status: active
files:
  - scripts/release/packages.py
  - scripts/release/evidence.py
  - scripts/release/provenance.py
  - scripts/release/qualify.py
  - scripts/release/test_release.py
---

# Release qualification

## Purpose

Make six-language candidate qualification and unresolved release gates observable without publishing packages.

## Public API

`qualify.py LANE OUTPUT` runs one lane into a new external directory. `evidence.py DIRECTORY SHA` validates seven hosted receipts. `provenance.py BASE HEAD` invokes Attest on an explicit nonempty ancestor range.

Internal Python helpers (not a library contract):

| Symbol | Behavior |
| --- | --- |
| `EXPECTED` | Required package artifact patterns per lane. |
| `REQUIRED` | All six languages plus Swift Linux. |
| `digest` | Return SHA-256 for artifact bytes. |
| `validate` | Reject incomplete or mismatched hosted receipts. |
| `release_range` | Resolve commits and reject empty/non-ancestor ranges. |
| `main` | Parse arguments and return failure for qualification errors. |
| `ROOT` | Repository root containing the candidate. |
| `COMMANDS` | Per-process command outcomes and output. |
| `VERSIONS` | Observed toolchain version output. |
| `run` | Execute and record a command; fail on nonzero exit. |
| `write` | Create generated evidence or consumer fixtures. |
| `copy_artifact` | Preserve package artifact bytes. |
| `source_archive` | Export candidate sources using git archive. |
| `extract` | Reject traversal and links before archive extraction. |
| `qualify` | Test/build/package and consume one lane. |
| `SHA` | Test-only candidate SHA fixture. |
| `EvidenceTests` | Positive and rejection cases for receipts. |
| `ProvenanceTests` | Range and Attest failure cases. |
| `ArchiveTests` | Unsafe archive rejection and real source-bundle extraction. |
| `PackageTests` | Malformed formats, missing members and wrong identities fail semantic validation. |
| `WorkflowTests` | Bounded read-only/no-publication workflow regression checks. |
| `make_package` | Generate minimal valid package fixtures for negative tests. |
| `check_workflow` | Reject write permissions, credentials and remote publication in qualification workflow text. |
| `safe_name` | Reject absolute or traversing archive paths. |
| `contents` | Read ZIP/tar members after rejecting links, special files and duplicate entries. |
| `require` | Require a named nonempty package member. |
| `validate_package` | Check package format, required source/runtime files and existing package identity. |

## Invariants

No qualification command publishes to a remote registry. Package identities and protocol behavior remain unchanged. All six languages and separate Swift Apple/Linux evidence are required. Evidence failure cannot produce a passing all-six result. Soft Trust provenance is not release approval.

## Behavioral Examples

A clean exact-head hosted run with seven successful receipts and matching artifact hashes passes qualification. Missing Apple evidence or changed artifact bytes fails. A local receipt cannot substitute for hosted evidence.

## Error Cases

Missing languages, stale SHA, dirty sources, failed commands, malformed evidence, unsafe artifact paths, missing artifacts and digest mismatch fail. Invalid refs, empty ranges and non-ancestor ranges fail provenance verification; Attest failure propagates.

## Dependencies

Python 3.11+ standard library, git, Attest, each language toolchain and existing package dependencies. Hosted workflows obtain toolchains; local installation requires authorization.

## Change Log

| Date | Change |
| --- | --- |
| 2026-10-18 | Add credential-free qualification, external consumers, evidence checks and manual release checklist under approved definition. |
| 2026-10-18 | prepare-reproducible-six-language-release-qualification-without-publishing-or-altering-protocol-behavior: Prepare reproducible six-language release qualification without publishing or altering protocol behavior |
