---
change: say-that-envelope-version-0x02-is-accepted-and-stop-treating-the-withdrawn-handshake-note-as-an-acceptance-test
artifact: context
---

# Context

A change request on 620e6b7 showed that the parity checklist still required opening vectors/pq-mlkem768.json handshake_note. That note is 1278 bytes. Current handshakes are 2366 bytes. The same review found TEST-VECTORS.md still listing version 0x02 as unsupported.
