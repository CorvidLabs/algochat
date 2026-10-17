---
id: record-the-2366-byte-localnet-matrix-and-say-that-0x05-reuses-the-handshake-session-key
state: approved
type: documentation
base_commit: 7a3c964ede48b01c5abff4929f9b6db880494724
---

# Record the 2366-byte LocalNet matrix and say that 0x05 reuses the handshake session key

## Intent

Record the 2366-byte LocalNet matrix and say that 0x05 reuses the handshake session key

## Affected Canonical Specs

- `protocol`

## Acceptance Criteria

- PROTOCOL.md says everyday and Extra lock messages use a fresh ephemeral key, and a 0x05 message reuses the handshake session key. PARITY.md records LocalNet rounds 41641 through 41736 for the 2366-byte handshake and marks rounds 41059 through 41154 as withdrawn.

## No-spec Rationale

Not applicable
