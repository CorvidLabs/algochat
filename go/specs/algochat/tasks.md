---
spec: algochat.spec.md
---

## Tasks

- [x] Document the existing implemented primitives and unfinished-client boundary.
- [x] Assign stable requirement identifiers without changing package behavior.
- [x] Preserve the existing Go compatibility workflow.
- [x] Raise the standard note ceiling to 4096 bytes and price allowed notes with the consensus surcharge.

- [x] Register existing PSK, hybrid-session and PQCross sources/exports without claiming a high-level client.
- [x] Distinguish active root qualification from accepted historical matrix requirements and document gaps.
- [x] Keep PSK counters caller-owned, round-trip MaxUint32, and do not add replay state.
- [x] Reject note-facing opens longer than 4096 bytes without giving DecodeEnvelope a plaintext ceiling.
