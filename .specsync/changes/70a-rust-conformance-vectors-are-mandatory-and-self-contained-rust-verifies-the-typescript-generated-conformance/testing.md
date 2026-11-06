---
change: 70a-rust-conformance-vectors-are-mandatory-and-self-contained-rust-verifies-the-typescript-generated-conformance
artifact: testing
---

# Testing

Plan:

| Requirement | Check |
| --- | --- |
| REQ-protocol-10 | `cargo test --locked --test conformance` in `rs/`. Mutation runs in a scratch copy that delete a vector file, drop a section and rename a 06 case must each fail. A release test scans Rust tests for a return on a missing path. |
| REQ-release-3 | `python3 -m unittest discover -s scripts/release -v`: vector-copy and boundary positives and negatives. `cargo package --list` shows only the allowed members. |
| REQ-release-1 | Clean-clone `qualify.py rs` (tests run inside the extracted crate) and `qualify.py ts` (`verify.mjs`: 85 checks), each exit 0. Hosted Release qualification on the PR. |

Repository gates: `fledge lanes run verify`, `specsync change check --commit` and `fledge trust verify`.
