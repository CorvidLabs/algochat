---
change: python-algochat-encryption-public-key-returns-raw-bytes
artifact: plan
---

# Plan

## Approach

Return `public_key_to_bytes(self._encryption_public_key)` from the property and tighten the existing test to assert 32 raw bytes. The private `_encryption_public_key` object and every internal use stay as they are.

## Out of scope

Any other Python API, the protocol, vectors, and the other five languages.

## Steps

1. Return raw bytes from `AlgoChat.encryption_public_key`.
2. Assert 32 raw bytes in `py/tests/test_client.py`.
3. Run the Python suite, including the localnet tests, on a local network.
4. Definition approval, review, verification and finalize are Leif's. They are not recorded by the agent.

## Risks

A caller that used the returned object as an `X25519PublicKey` breaks. Nothing in this repo does; the annotation and docstring always promised bytes.

## Constraints consulted

KEY-1.a and KEY-2 in hi/key.md. py/AGENTS.md: no SDD approval on a human owner's behalf. Leif (Oct 29, 2026): run it end to end on a local Algorand network before any push; local network only. `cryptography` stays the only runtime dependency.
