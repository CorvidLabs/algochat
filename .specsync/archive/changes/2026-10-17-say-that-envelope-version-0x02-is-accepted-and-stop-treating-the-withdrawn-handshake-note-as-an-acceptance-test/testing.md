---
change: say-that-envelope-version-0x02-is-accepted-and-stop-treating-the-withdrawn-handshake-note-as-an-acceptance-test
artifact: testing
---

# Testing

## Requirement evidence

| Requirement | Evidence |
| --- | --- |
| REQ-protocol-2 | TEST-VECTORS.md test case 2.2 no longer lists version 0x02 as unsupported. PARITY.md does not require opening handshake_note. Go and Rust tests accept a valid ACPQ signature. |
