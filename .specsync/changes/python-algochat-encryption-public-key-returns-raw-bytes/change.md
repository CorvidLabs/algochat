---
id: python-algochat-encryption-public-key-returns-raw-bytes
state: draft
type: bug_fix
base_commit: 8e165d5a399fd0e5b94fe2998a07f2a43f448328
---

# Python AlgoChat.encryption_public_key returns raw bytes

## Intent

Python AlgoChat.encryption_public_key returns raw bytes

## Affected Canonical Specs

- None

## Acceptance Criteria

- KEY-2 and KEY-1.a in hi/key.md (existing intent): AlgoChat.encryption_public_key returns the raw 32-byte X25519 public key, as its annotation and docstring say, so a Python caller can publish it and it matches what other implementations derive from the same account.

## No-spec Rationale

Python-only return-type fix; the protocol spec, vectors and wire bytes do not change.
