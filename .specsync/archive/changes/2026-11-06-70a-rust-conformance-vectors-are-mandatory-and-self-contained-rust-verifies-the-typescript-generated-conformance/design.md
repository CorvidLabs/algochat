---
change: 70a-rust-conformance-vectors-are-mandatory-and-self-contained-rust-verifies-the-typescript-generated-conformance
artifact: design
---

# Design

- **`rs/vectors/`** holds byte-identical copies of the five `vectors/*.json` files and the seven `ts/conformance/vectors/0*.json` files, with the same file names in one flat directory. The sources stay canonical, and the copies are never edited by hand.
- **The release check** is `packages.check_rust_vector_copies(root)`. It returns one problem string per missing, extra or differing copy. `qualify.py rs` stops on any problem before running `cargo test`. The release unit tests cover the real repository plus three negative fixtures.
- **Package boundary (REQ-release-3):** `include` adds `/vectors/*.json` and `/tests/*.rs`. `validate_crate_boundary` also accepts `vectors/*.json` and `tests/*.rs`, and still rejects `src/bin/`, `examples/`, nested directories, workflows, agent and spec files.
- **Rust tests:**
  - `tests/conformance.rs` loads each file through one `vector(name)` helper rooted at `CARGO_MANIFEST_DIR/vectors`, which panics if the file is missing.
  - For each file it asserts the exact set of top-level sections.
  - Every array element must match a handler, and an unmatched element fails.
  - One `PENDING` list names the 01 `accounts[].mnemonic` check as `#73`.
- **Existing tests:**
  - Unit tests in `src/` switch from `../vectors` to `vectors/` inside the package. Only test modules change.
  - `tests/cross_impl.rs` loses its ten sibling-directory tests and their helpers, and keeps the four in-file known-answer tests.
- **TypeScript lane:** `qualify.py ts` runs `bun conformance/tools/verify.mjs` after `bun test`.
- **Packaged tests:** `qualify.py rs` runs `cargo test --locked` inside the extracted crate before the consumer smoke test, so the crate's own tests have to pass from the package.
