---
change: prove-on-localnet-that-all-six-libraries-read-and-write-0x01-0x02-0x04-and-0x05-notes-for-empty-small-large-and-maximum
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| REQ-protocol-2 | `ts/scripts/pq-matrix-localnet.ts` submitted 90 notes on LocalNet, rounds 41059 through 41154. Every library opened every note. Version 0x02 header binding matches TypeScript. Go Extra lock is in `go/psk.go`. |

LocalNet must be up. The driver funds two accounts and, for each library, submits:

- four `0x01` notes: empty, small, large, maximum
- four `0x02` notes at those sizes, then three more at counters 0, 1, and 2
- one `0x04` handshake and four `0x05` notes at those sizes

Every library opens every confirmed note. A header rewrite on a version `0x02` note fails closed. Existing `0x01` and `0x02` unit tests still pass.
