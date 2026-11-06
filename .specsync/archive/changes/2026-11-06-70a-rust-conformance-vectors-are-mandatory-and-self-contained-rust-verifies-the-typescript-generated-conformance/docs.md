---
change: 70a-rust-conformance-vectors-are-mandatory-and-self-contained-rust-verifies-the-typescript-generated-conformance
artifact: docs
---

# Docs

- `rs/README.md`: a short Testing note saying that `rs/vectors/` holds copies of the canonical vectors, that they must never be edited by hand, and how to refresh them.
- `CHANGELOG.md`: an Unreleased entry for mandatory Rust conformance vectors.
- `specs/release/release.spec.md` and `specs/protocol/protocol.spec.md`: the new check and the requirement rows.
- `ts/conformance/README.md`: the Continuous integration paragraph now says `qualify.py ts` runs the verifier.
