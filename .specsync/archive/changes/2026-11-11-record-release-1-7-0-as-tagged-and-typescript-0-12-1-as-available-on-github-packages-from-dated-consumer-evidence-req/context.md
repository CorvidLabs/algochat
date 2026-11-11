---
change: record-release-1-7-0-as-tagged-and-typescript-0-12-1-as-available-on-github-packages-from-dated-consumer-evidence-req
artifact: context
---

# Context

Release 1.7.0 shipped on 2026-11-11 UTC (the evening of 2026-11-10, MST):
- #89 merged as `aadcf73813075a5210ac7bf5e8777b5cddc80a65`.
- Annotated tag `v1.7.0` points at that commit.
- `publish-npm.yml` published TypeScript `@corvidlabs/ts-algochat` 0.12.1 to GitHub Packages from the tag in run 42941689248.
- The GitHub Release v1.7.0 is published.
- Rust 0.7.0 is not published yet. `publish-crates.yml` waits for the owner to confirm the crates.io trusted publisher and revoke the 0.6.0 API token, so crates.io still serves 0.6.0.

Three files on main still describe the state before the release:
- `docs/RELEASE.md` says "Release 1.7.0 is approved, not yet tagged". Its TypeScript row says 0.12.1 is "not yet published", and the GitHub Packages entry still shows 0.12.0.
- `ts/README.md` and `ts/index.html` say GitHub Packages serves 0.12.0 until 0.12.1 is published, and their install commands pin 0.12.0.

REQ-release-5 says registry availability is recorded only from dated external-consumer evidence. That evidence now exists for TypeScript 0.12.1, so this change brings the docs into line with the requirement.

This is a bug fix under Leif's merge rule of 2026-11-10, which the coordinator (hc terminal t370) passed on again when the agents were unpaused. Docs that make the record match existing requirements may run the full SpecSync lifecycle with 0xLeif as approve and review actor, and merge once CI is green and every review thread is resolved. On 2026-11-11 the coordinator said these records count as a bug fix: "Do the records PR NOW for what's live ... merge when green."

Out of scope:
- The Rust 0.7.0 availability record, which waits for publish-crates.yml and the crates.io consumer proof and comes in a later follow-up.
- `CHANGELOG.md`, which is the tagged release text.
- The root `README.md` Rust row, which already says crates.io serves 0.6.0.
