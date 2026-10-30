---
id: python-one-to-one-messages-are-hybrid-only-and-key-discovery-matches-typescript-algochat-63-algochat-1-6-1
state: draft
type: bug_fix
base_commit: 7d7b280ae027b55502a3d16d72ab7afac3f93043
---

# Python one-to-one messages are hybrid only and key discovery matches TypeScript (algochat#63, AlgoChat 1.6.1)

## Intent

Python one-to-one messages are hybrid only and key discovery matches TypeScript (algochat#63, AlgoChat 1.6.1)

## Affected Canonical Specs

- None

## Acceptance Criteria

- AC1-AC7 as Leif confirmed on algochat#63 on 2026-10-30, and BASE-3, ENCRYPT-2, AGENT-5.a to AGENT-5.d and KEYS-4.d in hi/: AC1 py-algochat bot and agent one-to-one messages send only hybrid, a 0x04 handshake then 0x05, never 0x01 or 0x02; AC2 when the peer lacks an X25519 key or a signed ML-KEM-768 key, sending refuses with HybridKeyNotFoundError and pays nothing, never falling back to classical; AC3 incoming 0x04 and 0x05 messages are decrypted and read, a 0x05 only under a handshake from the same sender; AC4 incoming 0x01 and 0x02 one-to-one messages are rejected and not read (Leif: 'Ac4: yes'); AC5 discover_encryption_key counts only 32- or 96-byte self-notes as announcements and otherwise uses the header key of the account's own 0x01 messages, matching TypeScript exactly with no 0x04 or 0x05 header fallback; AC6 an announcement with a bad signature is rejected; AC7 regression tests cover these, including the shifted PSK self-note and the rekeyed account; Q1(b) the plain library send path is hybrid-only too, AlgoChat.encrypt refuses with ClassicalSendRefusedError and AlgoChat.encrypt_hybrid sends; AC8 shipped as AlgoChat 1.6.1 with py-algochat 0.6.0 and a CHANGELOG entry (Leif: 'Ac8: idc'); the Python suite, ruff on changed files, specsync check, hi check and bun scripts/validate.ts pass.

## No-spec Rationale

The wire format and the root protocol and release specs do not change: 0x04 and 0x05 notes are already in PROTOCOL.md section 5.7 and the vectors. The Python module specs under py/specs are updated in place. docs/RELEASE.md and REQ-release-5 name the release versions; docs/RELEASE.md belongs to the open docs PR #62, so both are updated after it lands.
