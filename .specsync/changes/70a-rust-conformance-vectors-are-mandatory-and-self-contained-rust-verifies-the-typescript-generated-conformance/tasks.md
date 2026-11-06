---
change: 70a-rust-conformance-vectors-are-mandatory-and-self-contained-rust-verifies-the-typescript-generated-conformance
artifact: tasks
---

# Tasks

- [x] Add failing release tests: vector copies (real repository, plus missing, extra and differing copies), crate boundary (`vectors/*.json` and `tests/*.rs` accepted, `examples/`, `src/bin/` and nested `tests/` still rejected), and no early return on a missing path in Rust tests.
- [x] Add failing `rs/tests/conformance.rs` covering 00-06 and the shared vectors, with exact sections, matched cases and the pending list.
- [x] Copy the 12 vector files to `rs/vectors/`, and repoint the `src/` test modules.
- [x] Implement `check_rust_vector_copies` and the boundary change, and extend `qualify.py` for rs and ts.
- [x] Remove the sibling-directory tests from `rs/tests/cross_impl.rs`.
- [x] Update `rs/Cargo.toml` `include`, the specs, `rs/README.md` and `CHANGELOG.md`.
- [x] Run the release tests, clean-clone `qualify.py rs` and `ts`, `fledge lanes run verify` and `fledge trust verify`, and record the evidence.
- [ ] Open the PR without merging.
