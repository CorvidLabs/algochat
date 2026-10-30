---
id: record-algochat-1-6-1-and-py-algochat-0-6-0-in-the-release-instructions-after-algochat-64
state: implementing
type: documentation
base_commit: 34eb8622d50f58c5e31cf7eee8729924b0a460f6
---

# Record AlgoChat 1.6.1 and py-algochat 0.6.0 in the release instructions (after algochat#64)

## Intent

Record AlgoChat 1.6.1 and py-algochat 0.6.0 in the release instructions (after algochat#64)

## Affected Canonical Specs

- `release`

## Acceptance Criteria

- From algochat#64 AC8 (Leif on #63, 2026-10-30: 'Ac8: idc'): docs/RELEASE.md and REQ-release-5 name release 1.6.1 with repository tag v1.6.1 (protocol specification 1.6.0) and py-algochat 0.6.0, other library versions unchanged, previous release v1.6.0 and go/v0.5.0; RELEASE.md marks the 1.6.1 rows pending until #64 merges and is tagged; py/docs/run-your-own-bot.md says one-to-one messages are hybrid only (0x04 then 0x05, protocol 0x03 and up, never 0x01 or 0x02), the bot must publish its keys with publish-keys, senders need a signed ML-KEM-768 key, and a missing key raises HybridKeyNotFoundError. Merges only after #64.

## No-spec Rationale

Not applicable
