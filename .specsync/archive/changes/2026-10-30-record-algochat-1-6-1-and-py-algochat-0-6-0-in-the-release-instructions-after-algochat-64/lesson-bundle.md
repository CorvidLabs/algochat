# Lesson bundle — record-algochat-1-6-1-and-py-algochat-0-6-0-in-the-release-instructions-after-algochat-64

Material for folding this change's lessons into each affected module's lesson file.
Synthesise from what actually happened below; do not restate the change description.

## What this change was

- **Title**: Record AlgoChat 1.6.1 and py-algochat 0.6.0 in the release instructions (after algochat#64)
- **Kind**: Documentation
- **Specs**: release
- **Paths**: docs/RELEASE.md, py/docs/run-your-own-bot.md
- **Acceptance**: From algochat#64 AC8 (Leif on #63, 2026-10-30: 'Ac8: idc'): docs/RELEASE.md and REQ-release-5 name release 1.6.1 with repository tag v1.6.1 (protocol specification 1.6.0) and py-algochat 0.6.0, other library versions unchanged, previous release v1.6.0 and go/v0.5.0; RELEASE.md marks the 1.6.1 rows pending until #64 merges and is tagged; py/docs/run-your-own-bot.md says one-to-one messages are hybrid only (0x04 then 0x05, protocol 0x03 and up, never 0x01 or 0x02), the bot must publish its keys with publish-keys, senders need a signed ML-KEM-768 key, and a missing key raises HybridKeyNotFoundError. Merges only after #64.

## Evidence

- Verification commit: `3dbe3c883f09dd4b879cf07b3972b7750b7feeb9`
- Base commit: `34eb8622d50f58c5e31cf7eee8729924b0a460f6`
- Verified by: `specsync check --spec release`

## From the change's context.md

# Context

algochat#63 found that py-algochat 0.5.0 sent classical `0x01` one-to-one messages. Leif's rule is that AlgoChat and Raven use protocol `0x03` and up only. Draft PR algochat#64 fixes it as AlgoChat 1.6.1 with py-algochat 0.6.0 (Leif on #63, 2026-10-30: "Ac8: idc") and bumps CHANGELOG.md, README.md, py/README.md and py/pyproject.toml. It leaves docs/RELEASE.md, REQ-release-5 and py/docs/run-your-own-bot.md to docs PR #62.

This change only records those versions and the hybrid-only behavior in the docs. It must merge after #64; until #64 merges and `v1.6.1` is tagged, docs/RELEASE.md marks the 1.6.1 rows pending. No protocol, crypto or manifest file changes here.

## From the change's testing.md

# Testing

Docs only. `python3 -m unittest discover -s scripts/release` passes, `bun scripts/validate.ts` validates the protocol documents, `specsync check` passes, and lychee finds no new broken links in docs/RELEASE.md or py/docs/run-your-own-bot.md. The facts in the bot guide were checked against algochat#64 (`AgentCore.publish_key`, `AgentCore.publish_pq_key`, `publish-keys`, `HybridKeyNotFoundError`, hybrid `0x04`/`0x05` only). The Python suite of #64 passed on a native local network.

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| REQ-release-5 | docs/RELEASE.md names release 1.6.1 with repository tag `v1.6.1` (protocol specification 1.6.0), TypeScript 0.12.0, Python 0.6.0, Rust 0.6.0, Kotlin 0.5.0 and Go `go/v0.5.0` unchanged, with `v1.6.0` and `go/v0.5.0` as the previous release, and marks the 1.6.1 rows pending until algochat#64 merges and is tagged. Python 0.6.0 and the CHANGELOG 1.6.1 section come from #64. No tag, registry token or publish workflow was added. |

## Where these lessons go

- `specs/release/context.md`
