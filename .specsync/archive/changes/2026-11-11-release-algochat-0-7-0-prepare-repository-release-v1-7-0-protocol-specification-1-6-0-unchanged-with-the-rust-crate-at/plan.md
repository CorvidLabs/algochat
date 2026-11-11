---
change: release-algochat-0-7-0-prepare-repository-release-v1-7-0-protocol-specification-1-6-0-unchanged-with-the-rust-crate-at
artifact: plan
---

# Plan

## Approach

A metadata, version and documentation release candidate, prepared before the definition approval so that Leif's one decision covers a concrete, qualified candidate. No library, test or wire change.

## Out of scope

- Pushing the tag, creating a GitHub release, or any registry publication from this change. That covers crates.io, GitHub Packages and PyPI. The tag and the publications follow the merge, as listed below.
- The post-publish crates.io consumer proof.
- `rs/src`, `ts/src`, `py/src` and the other library sources.
- #84 (70c-1, 0.8.0) and the later rows of the proposal: #69, #71 and #72.

## Steps

1. Bump the versions: `rs/Cargo.toml` to 0.7.0, TypeScript to 0.12.1 (D-r2) and Python to 0.6.1 (D-r3).
2. Turn CHANGELOG.md's Unreleased section into a 1.7.0 section with the library version table.
3. Update the release record and labels: `docs/RELEASE.md` (1.7.0 rows; Rust 0.7.0 pending publication, with no availability claim), `README.md`, `rs/README.md`, `docs/HLD.md`, `index.html`, the TypeScript and Python READMEs, and `specs/release` (REQ-release-5).
4. Qualify every lane:
   - locally in a clean committed clone, for the lanes this machine has toolchains for;
   - hosted `release-qualification.yml` dispatched on the candidate branch, all seven lanes plus the aggregate.
5. Pre-publish consumer proof from the packaged `algochat-0.7.0.crate`: a fresh Cargo project outside the repository, alone and alongside `algonaut` 0.9.0. Record the resolved `ctutils`, `reqwest` and `rustls`.
6. Run `provenance.py v1.6.2 <candidate>` and record the result.
7. Open a draft PR, then stop.

After Leif's go, and not part of this change:
1. Native approval, then `change check --commit`, review, ship.
2. Merge.
3. Tag `v1.7.0` on the merge commit.
4. Publish TypeScript `0.12.1` to GitHub Packages with the manual `Publish npm` workflow from tag `v1.7.0` (D-r2).
5. The owner confirms the crates.io trusted publisher and revokes the 0.6.0 token.
6. Dispatch `publish-crates.yml` with `v1.7.0` and `0.7.0`.
7. Run the post-publish consumer proofs and record availability.

## Risks

- crates.io is permanent. A wrong 0.7.0 can be yanked, never replaced, so the packaged-crate proof runs before publication.
- `publish-crates.yml` and the trusted publisher have never run (0.6.0 was published by hand), so the first dispatch may fail on configuration outside this repository.
- The exact `ctutils` pin may conflict with Raven Desktop's graph; the consumer proof checks it with `algonaut` 0.9.0.
- Readers may take `v1.7.0` to mean protocol 1.7.0. The docs state that the protocol specification is 1.6.0, as 1.6.2 did.
- Provenance is degraded on every recent PR. `provenance.py` may fail, and that becomes an input to Leif's go.

## Constraints consulted

CRATE-7. REQ-release-2, 3, 5, 8 and 9. The Release A lessons: availability only from dated external-consumer evidence, and a git tag is not a registry publication. Proposal §3, step 5.
