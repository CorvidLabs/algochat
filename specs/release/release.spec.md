---
module: release
version: 5
status: active
files:
  - scripts/release/packages.py
  - scripts/release/evidence.py
  - scripts/release/provenance.py
  - scripts/release/qualify.py
  - scripts/release/test_release.py
  - scripts/parity/mesh.py
  - scripts/parity/rust_replay.py
  - scripts/parity/rust_replay_test.rs
  - scripts/parity/swift_history.py
  - scripts/parity/swift-history/Package.swift
  - scripts/parity/swift-history/Sources/SwiftHistoryProbe/main.swift
  - scripts/parity/test_mesh.py
  - scripts/parity/test_probes.py
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
| `digest` | Return SHA-256 for artifact bytes or normalized local replay responses in its respective tool. |
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
| `resolve_npm_tarball` | Use the TypeScript archive npm wrote when `--json` names a different scoped filename. |
| `SHA` | Test-only candidate SHA fixture. |
| `EvidenceTests` | Positive and rejection cases for receipts. |
| `ProvenanceTests` | Range and Attest failure cases. |
| `ArchiveTests` | Unsafe archive rejection and real source-bundle extraction. |
| `PackageTests` | Malformed formats, missing members and wrong identities fail semantic validation. |
| `WorkflowTests` | Bounded read-only/no-publication workflow regression checks. |
| `NpmPackTests` | Scoped npm pack JSON names resolve to the archive on disk. |
| `make_package` | Generate minimal valid package fixtures for negative tests. |
| `check_workflow` | Reject write permissions, credentials and remote publication in qualification workflow text. |
| `safe_name` | Reject absolute or traversing archive paths. |
| `contents` | Read ZIP/tar members after rejecting links, special files and duplicate entries. |
| `require` | Require a named nonempty package member. |
| `validate_package` | Check package format, required source/runtime files and existing package identity. |

Local verification tools (not hosted qualification receipts):

| Symbol | Behavior |
| --- | --- |
| `LANGS` | The six required helper languages; none is silently omitted. |
| `Tool` | Start a JSON-lines helper, require matching response IDs and bounded replies, and reap it on cleanup. |
| `TEMPLATE` | Swift history consumer source template. |
| `write_json` | Serialize Swift probe observations and wrapper results. |
| `tracked_snapshot` | Hash tracked repository bytes before and after the isolated Swift consumer. |
| `run_command` | Retain Swift consumer command output, timeouts and exit codes. |
| `read_observation` | Reject incomplete or inconsistent Swift history observations. |
| `HelperProtocolTests` | Reject missing, malformed, wrong-ID and unresponsive helper output. |
| `CommandLineTests` | Reject reused or in-checkout output directories. |
| `ProbeClassificationTests` | Prevent absent/malformed probe reports or mismatched exits from becoming passing evidence. |

`mesh.py --output NEWDIR` builds fresh Go/Rust/Kotlin/Swift helpers and exercises all-six low-level reads with the installed TypeScript/Python dependencies. It records candidate, dirty-tree state, versions, commands and matrix outcomes. macOS 26+ is needed for the Swift hybrid helper; Linux cannot silently skip it. Exit 0 means the asserted paths passed, 1 means an assertion failed, and 2 means execution did not complete.

`rust_replay.py --output NEWDIR` adds only a duplicate-receive test in a temporary crate copy. `swift_history.py --output NEWDIR` builds a temporary consumer of public PSK/indexer APIs and tests repeated history, persisted restart, authentication failure and a distinct-transaction replay. Both return 1 for violated required behavior, 2 for infrastructure errors, and 0 only when their invariants pass. Test fixtures are synthetic; ambient LocalNet files and user storage are untouched. The Rust test and Swift consumer are private probe implementation, not library API.

## Invariants

No qualification command publishes to a remote registry. Package identities and protocol behavior remain unchanged. All six languages and separate Swift Apple/Linux evidence are required. Evidence failure cannot produce a passing all-six result. Soft Trust provenance is not release approval. Dated local audit results stay tied to their recorded source and cannot qualify later commits. A defect reproduced by a regression probe is not behavioral acceptance; failed or incomplete probes cannot report success.

## Behavioral Examples

A clean exact-head hosted run with seven successful receipts and matching artifact hashes passes qualification. Missing Apple evidence or changed artifact bytes fails. A local receipt cannot substitute for hosted evidence. TypeScript qualification installs the tarball that `npm pack` wrote. A scoped filename that exists only in npm 8's JSON does not hide that archive or invent a receipt.

## Error Cases

Missing languages, stale SHA, dirty sources, failed commands, malformed evidence, unsafe artifact paths, missing artifacts and digest mismatch fail. Invalid refs, empty ranges and non-ancestor ranges fail provenance verification; Attest failure propagates.

## Dependencies

Python 3.11+ standard library, git, Attest, each language toolchain and existing package dependencies. Hosted workflows obtain toolchains; local installation requires authorization.

## Change Log

| Date | Change |
| --- | --- |
| 2026-10-18 | Preserve dated local parity evidence and portable low-level replay / required-behavior probes. |
| 2026-10-18 | Run a language qualification lane only when that tree changes, and the full matrix only for protocol, vector, or release-script changes. |
| 2026-10-18 | Add credential-free qualification, external consumers, evidence checks and manual release checklist under approved definition. |
| 2026-10-18 | prepare-reproducible-six-language-release-qualification-without-publishing-or-altering-protocol-behavior: Prepare reproducible six-language release qualification without publishing or altering protocol behavior |
| 2026-10-18 | record-this-repository-as-the-source-for-every-algochat-library: Record this repository as the source for every AlgoChat library |
| 2026-10-18 | preserve-the-verified-six-language-parity-audit-with-portable-replay-scripts-and-explicit-rust-replay-and-swift-history: Preserve the verified six-language parity audit with portable replay scripts and explicit Rust replay and Swift history regression probes |
| 2026-10-18 | Resolve the TypeScript tarball from the file npm wrote when the JSON filename differs. |
