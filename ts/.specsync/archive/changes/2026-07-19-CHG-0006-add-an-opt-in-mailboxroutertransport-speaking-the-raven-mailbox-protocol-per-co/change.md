---
id: CHG-0006-add-an-opt-in-mailboxroutertransport-speaking-the-raven-mailbox-protocol-per-co
state: archived
type: feature
base_commit: ac0bd2351a2efc9da1ba7d3c424263bba3dcd5aa
---

# Add an opt-in MailboxRouterTransport speaking the raven mailbox protocol: per-counter key derivation, MBR-exact put groups, atomic N-recipient fan-out, burn/reclaim/status, off-chain box reads, gated behind service config

## Intent

Add an opt-in MailboxRouterTransport speaking the raven mailbox protocol: per-counter key derivation, MBR-exact put groups, atomic N-recipient fan-out, burn/reclaim/status, off-chain box reads, gated behind service config

## Affected Canonical Specs

- `algochat`

## Acceptance Criteria

- The transport derives raven mailbox ids byte-identically to an independent Node crypto implementation (HMAC-SHA256 msg_key
- SHA-256 mailbox id); plans put groups funding exactly 2500+400*(72+len) microALGO per leg; rejects empty and oversized envelopes and fan-out over 8 legs; sends single puts
- atomic fan-out puts
- burn
- and reclaim through a mocked algod client with correct ABI args
- box refs
- and group shape; reads mailbox boxes off-chain returning depositor
- write round
- and envelope; stays inert unless the service is configured with a mailbox app id; all existing tests plus the new tests pass in the fledge verify lane

## No-spec Rationale

Not applicable
