---
change: release-algochat-0-7-0-prepare-repository-release-v1-7-0-protocol-specification-1-6-0-unchanged-with-the-rust-crate-at
artifact: tasks
---

# Tasks

- [x] Bump the versions (Rust 0.7.0; TypeScript 0.12.1 per D-r2; Python 0.6.1 per D-r3).
- [x] Write the CHANGELOG 1.7.0 section.
- [x] Update the release docs and labels, and `specs/release`.
- [x] Run local qualification in a clean committed clone, and record the receipts.
- [x] Dispatch hosted `release-qualification.yml` on the candidate and record the run.
- [x] Run the pre-publish consumer proof (alone, and with `algonaut` 0.9.0) and record it.
- [x] Run `provenance.py v1.6.2 <candidate>` and record the result.
- [x] Open the draft PR, then stop for Leif's definition approval and release go.
- [x] Record Leif's 2026-11-10 decisions (D-r1, D-r2 with GitHub Packages publication, D-r3, degraded provenance) in the release docs and this change.
