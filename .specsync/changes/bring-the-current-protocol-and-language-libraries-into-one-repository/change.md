---
id: bring-the-current-protocol-and-language-libraries-into-one-repository
state: approved
type: migration
base_commit: 32b70eabbe39a6045d4557ab782c0fe150e6ce91
---

# Bring the current protocol and language libraries into one repository

## Intent

Bring the current protocol and language libraries into one repository

## Affected Canonical Specs

- None

## Acceptance Criteria

- The protocol documents and the TypeScript, Swift, Python, Rust, Kotlin, and Go libraries from their 4096-byte note releases are in this repository. Protocols stay 0x01 and 0x02. Post-quantum envelopes are absent. hi check passes and bun scripts/validate.ts passes.

## No-spec Rationale

The wire format stays protocols 0x01 and 0x02 with a 4096-byte note. This commit relocates the existing documents and libraries.
