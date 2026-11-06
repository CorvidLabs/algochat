---
change: 70a-rust-conformance-vectors-are-mandatory-and-self-contained-rust-verifies-the-typescript-generated-conformance
artifact: plan
---

# Plan

## Approach

Make the Rust interop evidence real. Rust reads the TypeScript-generated conformance vectors and the shared vectors from copies packaged in the crate. Every case is checked, and a missing vector or an unknown case fails. The tests also run from the published package. Tests are written and seen to fail before any implementation.

## Out of scope

- Changes to Rust library code (`rs/src` outside `#[cfg(test)]` modules).
- Mnemonic decoding (#73), ACPQ (#68), and the Hybrid conversation and 0x02 vectors (#70b).
- Regenerating any TS vector.
- Room and Raven payload vectors (#70c), and LocalNet app-to-app tests (#70d, raven-desktop).
- Any tag, version bump or publish.

## Steps

1. Write the failing tests:
   - release unit tests for `check_rust_vector_copies` and the widened crate boundary;
   - `rs/tests/conformance.rs`, which fails while `rs/vectors/` is missing;
   - a release test that no file under `rs/tests` or `rs/src` tests returns on a missing path.
2. Copy the 12 vector files into `rs/vectors/`, and point the `src/` test modules at them.
3. Implement `check_rust_vector_copies` and the boundary change, and wire both into `qualify.py rs`. Add `cargo test --locked` in the extracted crate and `verify.mjs` to `qualify.py ts`.
4. Remove the sibling-directory tests from `cross_impl.rs`.
5. Update `rs/Cargo.toml` `include`, the specs, `rs/README.md` and `CHANGELOG.md` (Unreleased).
6. Run the release tests, `qualify.py rs` and `qualify.py ts` in a clean clone, then `fledge lanes run verify` and `fledge trust verify`, and record the evidence.

## Risks

- A Rust case may disagree with a TS vector. That is a real interop bug: it is reported and fixed under its own bug, never by editing the vector.
- The crate gets larger (about 450 KiB of JSON) and now ships test sources.
- `cargo test` in the extracted crate needs registry access, as the existing consumer step already does.

## Constraints consulted

- CRATE-3 and CRATE-6.
- The Release A boundary (REQ-release-3 and REQ-release-9), widened only as stated here.
- `specs/release/context.md`: protocol, vector and release-script changes run the full matrix.
