---
change: preserve-the-verified-six-language-parity-audit-with-portable-replay-scripts-and-explicit-rust-replay-and-swift-history
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| REQ-release-6 | `python3 -m unittest discover -s scripts/parity -p 'test_*.py' -v` passes all 13 helper/probe classification checks. `ruff check scripts/parity/*.py` passes. The curated evidence validation checks all 84 original criteria, 246 typed references, 96 raw note hashes, 540 reader associations, 2388 original assertions, 8 receipt catalogs across 7 local categories, manifest integrity, local links and secret-field exclusions. The portable mesh rerun passes 2389 assertions (2388 matrix checks plus checkout preservation), 1080 reader calls and 180 message envelopes; records dirty-tree state instead of claiming clean candidate qualification. The Rust required-behavior probe exits 1, with 99 of 100 duplicate trials returning twice and source inputs preserved. The Swift probe exits 1 with exactly two history failures, while first read, distinct-transaction replay rejection and authentication-counter checks pass; tracked tree preserved. |

## Interpretation and scope

The historical complete local audit remains tied to `237a974`, including its 100/100 Rust observation; the packaged probe rerun observes 99/100 under independent scheduling. Neither is a statistical guarantee. Probe exit 1 is an open behavioral failure, not accepted implementation parity; exit 2 represents an execution problem. The PR packages honest findings and repeatable desired-behavior checks, without fixing library behavior or changing accepted intent.

New wrapper validation results are outside the checkout under `/tmp/algochat-pr-mesh-20261018`, `/tmp/algochat-pr-rust-replay-20261018`, and `/tmp/algochat-pr-swift-history-20261018`. Those mutable local directories are not public artifacts or hosted receipts. The committed selected evidence has its own manifest and explicit omitted-byte catalog.

Root Trust and strict SpecSync are checked before publication. Closing lifecycle approval remains a separate human step; the user requested the evidence PR, which does not imply acceptance of the known implementation defects.
