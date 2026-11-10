---
change: 79-rs-readme-md-describes-the-packaged-crate-s-contents-the-way-70a-packages-it-req-release-3-library-sources-tests-rs
artifact: tasks
---

# Tasks

- [x] Reword the install-section paragraph of `rs/README.md` to list what `cargo package --list` packages and to note that 0.6.0 predates it.
- [x] Check the wording against `cargo package --list --locked` in `rs/`.
- [x] Run `fledge lanes run verify` and `fledge trust verify`, and record the evidence.
- [x] Open the PR, wait for hosted checks, and resolve any review threads before merging.
