# Lesson bundle — preserve-the-verified-six-language-parity-audit-with-portable-replay-scripts-and-explicit-rust-replay-and-swift-history

Material for folding this change's lessons into the affected specs' `context.md`.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Preserve the verified six-language parity audit with portable replay scripts and explicit Rust replay and Swift history regression probes
- **Kind**: Documentation
- **Specs**: release
- **Paths**: docs/verification, scripts/parity, specs/release, docs/ACCURACY.md
- **Acceptance**: The PR preserves a dated audit tied to237a974 with exact tested counts, runtime/fixture limitations, raw interoperability receipts, all84 unchanged intent criteria and explicit open defects; provides portable six-language offline replay plus Rust concurrent-replay and Swift same-transaction-history probes that fail when required behavior is violated; keeps probes isolated from tracked library source and fails on missing tools/errors; validates the replay scripts and root Trust/strict SpecSync; opens and attaches the PR without claiming full parity, statistical95percent correctness, behavior fixes or release authorization.

## Evidence

- Verification commit: `5fad37b4f60334c219ae6e75e285eaaa3456450a`
- Base commit: `237a97488ac663fdf326e07badc383b4452db4ad`
- Verified by: `specsync check --spec release --strict`

## From the change's context.md

# Context

The requested parallel local audit of merged commit `237a974` finished with passing low-level interoperability but reproduced behavioral and documentation gaps. Three language-pair workers and an independent reviewer verified the result. The user then explicitly requested, "make a pr".

This definition packages that already reported audit and makes its highest-risk probes reproducible. Existing RELEASE-1/RELEASE-2 intent covers qualification and visible missing evidence. All 84 accepted intent sentences and IDs remain unchanged. No library behavior, dependencies, wire format, release credentials, workflows or publishing permissions change. The PR does not certify full parity, a statistical 95 percent correctness result, human acceptance of the implementations, or a release.

The local evidence bundle is `/tmp/algochat-local-parity-237a974-evidence.zip`. Commit portable scripts and selected receipts; clearly distinguish retained summaries/hash catalogs from package artifacts kept outside Git. Replay only low-level offline paths by default. Regression probes use temporary copies or consumers and fail when the existing replay/history requirements are violated. They must never pass merely because the defect is present.

## From the change's testing.md

# Testing

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| REQ-release-6 | `python3 -m unittest discover -s scripts/parity -p 'test_*.py' -v` passes all 13 helper/probe classification checks. `ruff check scripts/parity/*.py` passes. The curated evidence validation checks all 84 original criteria, 246 typed references, 96 raw note hashes, 540 reader associations, 2388 original assertions, 8 receipt catalogs across 7 local categories, manifest integrity, local links and secret-field exclusions. The portable mesh rerun passes 2389 assertions (2388 matrix checks plus checkout preservation), 1080 reader calls and 180 message envelopes; records dirty-tree state instead of claiming clean candidate qualification. The Rust required-behavior probe exits 1, with 99 of 100 duplicate trials returning twice and source inputs preserved. The Swift probe exits 1 with exactly two history failures, while first read, distinct-transaction replay rejection and authentication-counter checks pass; tracked tree preserved. |

## Interpretation and scope

The historical complete local audit remains tied to `237a974`, including its 100/100 Rust observation; the packaged probe rerun observes 99/100 under independent scheduling. Neither is a statistical guarantee. Probe exit 1 is an open behavioral failure, not accepted implementation parity; exit 2 represents an execution problem. The PR packages honest findings and repeatable desired-behavior checks, without fixing library behavior or changing accepted intent.

New wrapper validation results are outside the checkout under `/tmp/algochat-pr-mesh-20261018`, `/tmp/algochat-pr-rust-replay-20261018`, and `/tmp/algochat-pr-swift-history-20261018`. Those mutable local directories are not public artifacts or hosted receipts. The committed selected evidence has its own manifest and explicit omitted-byte catalog.

Root Trust and strict SpecSync are checked before publication. Closing lifecycle approval remains a separate human step; the user requested the evidence PR, which does not imply acceptance of the known implementation defects.

## Where these lessons go

- `specs/release/context.md`
