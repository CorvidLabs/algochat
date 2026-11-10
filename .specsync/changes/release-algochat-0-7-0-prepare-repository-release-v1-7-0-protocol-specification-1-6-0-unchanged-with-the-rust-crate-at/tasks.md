---
change: release-algochat-0-7-0-prepare-repository-release-v1-7-0-protocol-specification-1-6-0-unchanged-with-the-rust-crate-at
artifact: tasks
---

# Tasks

- [ ] Bump the versions (Rust 0.7.0; TypeScript and Python per D-r2 and D-r3).
- [ ] Write the CHANGELOG 1.7.0 section.
- [ ] Update the release docs and labels, and `specs/release`.
- [ ] Run local qualification in a clean committed clone, and record the receipts.
- [ ] Dispatch hosted `release-qualification.yml` on the candidate and record the run.
- [ ] Run the pre-publish consumer proof (alone, and with `algonaut` 0.9.0) and record it.
- [ ] Run `provenance.py v1.6.2 <candidate>` and record the result.
- [ ] Open the draft PR, then stop for Leif's definition approval and release go.
